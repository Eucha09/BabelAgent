import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import {
  AuthStatusJson,
  type AuthStatus,
  type AuthLoginDone,
  type AuthLoginOutput
} from '@shared/schema/agent'
import { fail, ok, type IpcResult } from '@shared/types'
import { effectiveConfigDir } from './session'

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g
const STATUS_TIMEOUT_MS = 20_000

/**
 * 설정에 경로가 없으면 PATH에서 claude 실행 파일을 찾는다.
 * shell: true 를 쓰지 않는다 — 경로에 공백이나 특수문자가 있어도 인자가 재해석되지 않게 한다.
 */
export function resolveClaudeExecutable(cliPath: string | null): string | null {
  if (cliPath) return cliPath
  const extensions =
    process.platform === 'win32'
      ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';').map((value) => value.toLowerCase())
      : ['']
  for (const dir of (process.env['PATH'] ?? '').split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(dir, `claude${extension}`)
      try {
        accessSync(candidate, constants.X_OK)
        return candidate
      } catch {
        // 다음 후보
      }
    }
  }
  return null
}

function authEnv(configDir: string | null): NodeJS.ProcessEnv {
  if (!configDir) return { ...process.env }
  return { ...process.env, CLAUDE_CONFIG_DIR: configDir }
}

function clean(text: string): string {
  return text.replace(ANSI, '')
}

const CLI_MISSING =
  'Claude Code CLI 실행 파일을 찾지 못했습니다. 설정에서 경로를 지정하세요.'

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

export type LoginEmitter = {
  output: (payload: AuthLoginOutput) => void
  done: (payload: AuthLoginDone) => void
}

let loginProcess: ChildProcess | null = null

/**
 * `claude auth login --claudeai`를 띄우고 출력을 흘려보낸다.
 * 브라우저가 열리고, 코드 붙여넣기를 요구하면 사용자가 입력한 값을 stdin으로 전달한다.
 */
export function startLogin(
  cliPath: string | null,
  configDir: string | null,
  emit: LoginEmitter
): IpcResult<null> {
  if (loginProcess) return fail('unknown', '로그인이 이미 진행 중입니다.')

  const executable = resolveClaudeExecutable(cliPath)
  if (!executable) return fail('cli-not-found', CLI_MISSING)

  const child = spawn(executable, ['auth', 'login', '--claudeai'], {
    env: authEnv(configDir),
    windowsHide: true
  })
  loginProcess = child

  const forward = (chunk: Buffer): void => emit.output({ text: clean(chunk.toString()) })
  child.stdout?.on('data', forward)
  child.stderr?.on('data', forward)

  child.on('error', (error) => {
    loginProcess = null
    emit.done({ ok: false, detail: error.message })
  })
  child.on('close', (code) => {
    loginProcess = null
    emit.done(code === 0 ? { ok: true } : { ok: false, detail: `종료 코드 ${code}` })
  })

  return ok(null)
}

/** 브라우저가 보여준 코드를 CLI 표준 입력으로 넘긴다. */
export function sendLoginInput(text: string): IpcResult<null> {
  if (!loginProcess?.stdin) return fail('unknown', '진행 중인 로그인이 없습니다.')
  loginProcess.stdin.write(`${text}\n`)
  return ok(null)
}

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
