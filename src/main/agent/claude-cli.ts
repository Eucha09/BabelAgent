import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { z } from 'zod'
import { meetsVersion, parseClaudeVersion, pickClaudeExecutable, updateOutcome } from '@core/cli/claude'
import type { ClaudeCliStatus, ClaudeExecutable, ClaudeInstallDone, ClaudeUpdateResult } from '@shared/schema/cli'
import { fail, ok, type IpcResult } from '@shared/types'
import { msg } from '../i18n'

/**
 * 앱이 쓰는 Claude Code 실행 파일 하나를 정하고(로그인·상태 조회·에이전트 세션 공통), 버전 확인·업데이트·설치를 맡는다.
 * 셸을 쓰지 않는다 — 경로의 공백·특수문자가 인자로 다시 해석되지 않게.
 */

/**
 * 버전 확인 제한 시간. 새로 받은 실행 파일(300 MB 넘음)은 처음 실행할 때 백신 검사 때문에 몇 초에서 수십 초 걸린다.
 */
const VERSION_TIMEOUT_MS = 60_000
/** 업데이트 직후 새 실행 파일의 버전을 다시 읽어 보는 횟수와 간격 */
const AFTER_UPDATE_ATTEMPTS = 4
const AFTER_UPDATE_DELAY_MS = 2_000
const UPDATE_TIMEOUT_MS = 180_000
const OUTPUT_TAIL = 2000
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g

/** 공식 설치 스크립트(Windows PowerShell). docs: code.claude.com/docs/en/setup */
const INSTALL_SCRIPT_URL = 'https://claude.ai/install.ps1'

const isWindows = process.platform === 'win32'
const exeName = isWindows ? 'claude.exe' : 'claude'

/** 공식 설치 스크립트가 실행 파일을 두는 곳 */
export function nativeClaudePath(): string {
  return join(homedir(), '.local', 'bin', exeName)
}

/** 빌드한 메인(out/main) 기준 node_modules. 설치판에서는 app.asar 안을 가리킨다 */
function nodeModulesDir(): string {
  return join(__dirname, '..', '..', 'node_modules')
}

/** Agent SDK 패키지에 든 실행 파일. 개발 중에만 있다(설치판에는 넣지 않는다) */
function bundledClaudePath(): string {
  return join(nodeModulesDir(), '@anthropic-ai', `claude-agent-sdk-${process.platform}-${process.arch}`, exeName)
}

/** PATH 에서 찾은 실행 파일. Windows 는 .exe 만 본다 — .cmd 는 셸 없이 실행할 수 없다 */
function pathClaude(): string[] {
  const dirs = (process.env['PATH'] ?? '').split(delimiter).filter(Boolean)
  return dirs.map((dir) => join(dir, exeName))
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, isWindows ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** 쓸 실행 파일. 설정 → 공식 설치 → PATH → SDK 내장(개발) 순 */
export function resolveClaude(cliPath: string | null): ClaudeExecutable | null {
  const candidates: ClaudeExecutable[] = [
    ...(cliPath ? [{ path: cliPath, source: 'setting' as const }] : []),
    { path: nativeClaudePath(), source: 'native' },
    ...pathClaude().map((path) => ({ path, source: 'path' as const })),
    { path: bundledClaudePath(), source: 'bundled' }
  ]
  return pickClaudeExecutable(candidates, isExecutable)
}

export function resolveClaudeExecutable(cliPath: string | null): string | null {
  return resolveClaude(cliPath)?.path ?? null
}

/** CLI 에 넘길 환경. 설정 폴더를 지정했으면 CLAUDE_CONFIG_DIR 로 넘긴다(env 는 통째로 바뀌므로 process.env 를 펼친다) */
export function claudeEnv(configDir: string | null): NodeJS.ProcessEnv {
  return configDir ? { ...process.env, CLAUDE_CONFIG_DIR: configDir } : { ...process.env }
}

const SdkPackage = z.object({ claudeCodeVersion: z.string().optional() })
let requiredVersionCache: string | null | undefined

/** 앱의 Agent SDK 가 맞춰진 Claude Code 버전(SDK package.json 의 claudeCodeVersion). 모르면 null */
export function requiredClaudeVersion(): string | null {
  if (requiredVersionCache !== undefined) return requiredVersionCache
  try {
    const raw: unknown = JSON.parse(readFileSync(join(nodeModulesDir(), '@anthropic-ai', 'claude-agent-sdk', 'package.json'), 'utf8'))
    requiredVersionCache = SdkPackage.parse(raw).claudeCodeVersion ?? null
  } catch {
    requiredVersionCache = null
  }
  return requiredVersionCache
}

type RunResult = { exitCode: number | null; output: string; timedOut: boolean }

/** 창 없이 실행하고 출력을 모은다 */
function run(executable: string, args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    let output = ''
    let settled = false
    let child: ChildProcess
    try {
      child = spawn(executable, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({ exitCode: null, output: error instanceof Error ? error.message : String(error), timedOut: false })
      return
    }
    const finish = (result: RunResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({ exitCode: null, output, timedOut: true })
    }, timeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', (error) => finish({ exitCode: null, output: `${output}\n${error.message}`, timedOut: false }))
    child.on('close', (code) => finish({ exitCode: code, output, timedOut: false }))
  })
}

type VersionRead = { version: string | null; error: string | null }

async function readVersion(executable: string, env: NodeJS.ProcessEnv): Promise<VersionRead> {
  if (!existsSync(executable)) return { version: null, error: null }
  const result = await run(executable, ['--version'], env, VERSION_TIMEOUT_MS)
  const version = result.exitCode === 0 ? parseClaudeVersion(result.output) : null
  if (version !== null) return { version, error: null }
  if (result.timedOut) return { version: null, error: msg().errors.cliTimeout(VERSION_TIMEOUT_MS / 1000) }
  const tail = result.output.replace(ANSI, '').trim().slice(-OUTPUT_TAIL)
  const exit = msg().errors.exitCode(result.exitCode === null ? msg().errors.noExitCode : String(result.exitCode))
  return { version: null, error: `${exit}${tail ? `: ${tail}` : ''}` }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 지금 쓰는 실행 파일과 버전 */
export async function claudeStatus(cliPath: string | null, configDir: string | null): Promise<ClaudeCliStatus> {
  const executable = resolveClaude(cliPath)
  const read = executable ? await readVersion(executable.path, claudeEnv(configDir)) : { version: null, error: null }
  const { version } = read
  const requiredVersion = requiredClaudeVersion()
  return {
    executable,
    version,
    runError: read.error,
    requiredVersion,
    meetsRequired: meetsVersion(version, requiredVersion),
    canUpdate: executable !== null && executable.source !== 'bundled' && version !== null,
    canInstall: isWindows
  }
}

/** 진행 중인 업데이트. 같은 때 다시 요청하면(화면이 두 번 확인하는 경우 등) 새로 돌리지 않고 이것을 함께 기다린다 */
let inFlight: Promise<IpcResult<ClaudeUpdateResult>> | null = null

/**
 * `claude update` 를 창 없이 돌리고 앞뒤 버전을 비교한다. 출력 문장은 해석하지 않는다.
 * 개발용 SDK 내장 실행 파일은 업데이트하지 않는다(skipped). 동시에 들어온 요청은 하나로 합친다.
 */
export function updateClaude(cliPath: string | null, configDir: string | null): Promise<IpcResult<ClaudeUpdateResult>> {
  if (!inFlight) {
    inFlight = runUpdate(cliPath, configDir).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

/** 업데이트 직후 새 실행 파일은 바뀌는 중이거나 처음 실행이라 늦을 수 있다. 버전이 읽힐 때까지 몇 번 더 본다 */
async function statusAfterUpdate(cliPath: string | null, configDir: string | null): Promise<ClaudeCliStatus> {
  let status = await claudeStatus(cliPath, configDir)
  for (let attempt = 1; attempt < AFTER_UPDATE_ATTEMPTS && status.version === null; attempt += 1) {
    await sleep(AFTER_UPDATE_DELAY_MS)
    status = await claudeStatus(cliPath, configDir)
  }
  return status
}

async function runUpdate(cliPath: string | null, configDir: string | null): Promise<IpcResult<ClaudeUpdateResult>> {
  const env = claudeEnv(configDir)
  const before = await claudeStatus(cliPath, configDir)
  if (!before.executable) return fail('cli-not-found', msg().errors.cliNotFoundInstall)
  if (before.version === null) {
    return fail('cli-not-found', msg().errors.cliCannotRun, before.runError ?? undefined)
  }
  if (!before.canUpdate) {
    return ok({ outcome: 'skipped', before: before.version, after: before.version, status: before })
  }
  const result = await run(before.executable.path, ['update'], env, UPDATE_TIMEOUT_MS)
  const after = await statusAfterUpdate(cliPath, configDir)
  const outcome = updateOutcome(before.version, after.version, result.exitCode)
  const detail = result.timedOut
    ? msg().errors.updateTimedOut
    : result.output.replace(ANSI, '').trim().slice(-OUTPUT_TAIL)
  return ok({
    outcome,
    before: before.version,
    after: after.version,
    ...(outcome === 'failed' && detail ? { detail } : {}),
    status: after
  })
}

let installProcess: ChildProcess | null = null

/**
 * 공식 설치 스크립트를 **보이는 콘솔 창**에서 돌린다(사용자가 [설치]를 눌렀을 때만). 인터넷에서 받은 스크립트를 실행하므로
 * 숨기지 않는다. 끝나면 창이 Enter 를 기다리고, 창이 닫히면 onDone. 성공 여부는 화면이 상태를 다시 읽어 판단한다.
 * conhost.exe 가 새 창을 열고 그 안에서 PowerShell 을 실행한다 — 명령은 고정 문자열이고 사용자 입력이 들어가지 않는다.
 */
export function startClaudeInstall(onDone: (payload: ClaudeInstallDone) => void): IpcResult<null> {
  if (!isWindows) {
    return fail('unknown', msg().errors.installUnsupportedOs, 'curl -fsSL https://claude.ai/install.sh | bash')
  }
  if (installProcess) return fail('unknown', msg().errors.installAlreadyOpen)
  const script = [
    "$Host.UI.RawUI.WindowTitle = 'Claude Code install'",
    `try { irm ${INSTALL_SCRIPT_URL} | iex } catch { Write-Host $_ -ForegroundColor Red }`,
    "Write-Host ''",
    "Read-Host 'Done. Press Enter to close this window'"
  ].join('; ')
  const child = spawn('conhost.exe', ['powershell.exe', '-NoProfile', '-Command', script], {
    stdio: 'ignore',
    windowsHide: false
  })
  installProcess = child
  child.on('error', () => {
    if (installProcess === child) installProcess = null
    onDone({ exitCode: null })
  })
  child.on('close', (code) => {
    if (installProcess === child) installProcess = null
    onDone({ exitCode: code })
  })
  return ok(null)
}

export function cancelClaudeInstall(): boolean {
  if (!installProcess) return false
  installProcess.kill()
  installProcess = null
  return true
}
