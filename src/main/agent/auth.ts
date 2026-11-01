import { spawn, type ChildProcess } from 'node:child_process'
import { extname } from 'node:path'
import { AuthStatusJson, type AuthLoginDone, type AuthStatus, type LoginMethod } from '@shared/schema/agent'
import { fail, ok, type IpcResult } from '@shared/types'
import { claudeEnv as authEnv, resolveClaudeExecutable } from './claude-cli'
import { effectiveConfigDir } from './session'

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g
const STATUS_TIMEOUT_MS = 20_000

function clean(text: string): string {
  return text.replace(ANSI, '')
}

const CLI_MISSING = 'Claude Code 를 찾지 못했습니다. 설정 화면에서 설치하거나 실행 파일 경로를 지정하세요.'

/** `claude auth status --json`으로 현재 로그인 상태를 읽는다. */
export async function readAuthStatus(
  cliPath: string | null,
  configDir: string | null
): Promise<IpcResult<AuthStatus>> {
  const executable = resolveClaudeExecutable(cliPath)
  if (!executable) return fail('cli-not-found', CLI_MISSING)

  return new Promise<IpcResult<AuthStatus>>((resolve) => {
    const child = spawn(executable, ['auth', 'status', '--json'], {
      env: authEnv(configDir),
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve(fail('unknown', '인증 상태 조회가 끝나지 않았습니다.'))
    }, STATUS_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve(fail('cli-not-found', CLI_MISSING, error.message))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const text = clean(stdout).trim()
      // 로그아웃 상태에서도 JSON을 주지만, 깨진 출력이면 원문을 그대로 보여준다.
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        resolve(
          fail('unknown', '인증 상태를 읽지 못했습니다.', clean(`${text}\n${stderr}`).trim() || `종료 코드 ${code}`)
        )
        return
      }
      const parsed = AuthStatusJson.safeParse(raw)
      if (!parsed.success) {
        resolve(fail('unknown', '인증 상태 형식이 예상과 다릅니다.', text))
        return
      }
      resolve(ok({ ...parsed.data, configDir: effectiveConfigDir(configDir), cliPath: executable }))
    })
  })
}

let loginProcess: ChildProcess | null = null

/**
 * Claude Code 로그인을 **Claude Code 자기 창**에서 진행한다. 브라우저 로그인과 코드 입력은 그 창과 Anthropic 의 흐름에서
 * 끝나고, 앱은 코드·토큰을 만지지 않는다(Anthropic 인증 규정: 자격 증명을 모으거나 중계하지 않는다).
 * Windows 에서는 conhost.exe 가 새 콘솔 창을 열고 그 안에서 CLI 를 실행한다 — 셸을 거치지 않아 경로가 다시 해석되지 않는다.
 * 창이 닫히면 onDone 을 부른다. 성공 여부는 화면이 로그인 상태를 다시 읽어 판단한다.
 */
export function startLogin(
  cliPath: string | null,
  configDir: string | null,
  method: LoginMethod,
  onDone: (payload: AuthLoginDone) => void
): IpcResult<null> {
  if (loginProcess) return fail('unknown', '로그인 창이 이미 열려 있습니다.')

  const executable = resolveClaudeExecutable(cliPath)
  if (!executable) return fail('cli-not-found', CLI_MISSING)
  const command = `"${executable}" auth login --${method}`
  if (process.platform !== 'win32') {
    return fail(
      'unknown',
      '이 운영체제에서는 앱이 로그인 창을 열지 못합니다. 터미널에서 아래 명령을 실행한 뒤 [상태 새로고침]을 누르세요.',
      command
    )
  }
  // .cmd·.bat 은 셸(cmd.exe)을 거쳐야 실행된다. 셸을 쓰지 않는 규칙이라 막는다
  if (['.cmd', '.bat'].includes(extname(executable).toLowerCase())) {
    return fail(
      'unknown',
      'CLI 경로가 배치 파일이라 로그인 창을 열 수 없습니다. 터미널에서 아래 명령을 실행하거나, 설정에서 claude.exe 경로를 지정하세요.',
      command
    )
  }

  const child = spawn('conhost.exe', [executable, 'auth', 'login', `--${method}`], {
    env: authEnv(configDir),
    stdio: 'ignore',
    windowsHide: false
  })
  loginProcess = child
  child.on('error', () => {
    if (loginProcess === child) loginProcess = null
    onDone({ exitCode: null })
  })
  child.on('close', (code) => {
    if (loginProcess === child) loginProcess = null
    onDone({ exitCode: code })
  })
  return ok(null)
}

/** 열어 둔 로그인 창을 닫는다. */
export function cancelLogin(): IpcResult<boolean> {
  if (!loginProcess) return ok(false)
  loginProcess.kill()
  loginProcess = null
  return ok(true)
}

export async function logout(
  cliPath: string | null,
  configDir: string | null
): Promise<IpcResult<null>> {
  const executable = resolveClaudeExecutable(cliPath)
  if (!executable) return fail('cli-not-found', CLI_MISSING)

  return new Promise<IpcResult<null>>((resolve) => {
    const child = spawn(executable, ['auth', 'logout'], {
      env: authEnv(configDir),
      windowsHide: true
    })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', (error) => resolve(fail('cli-not-found', CLI_MISSING, error.message)))
    child.on('close', (code) => {
      if (code === 0) resolve(ok(null))
      else resolve(fail('unknown', '로그아웃에 실패했습니다.', clean(output).trim()))
    })
  })
}
