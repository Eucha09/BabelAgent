import { spawn } from 'node:child_process'
import { join } from 'node:path'

/**
 * 보이는 콘솔 창에서 프로그램을 실행하고, 창이 닫히면 알려 준다(Claude Code 설치 창·로그인 창). Windows 전용.
 *
 * conhost.exe 를 spawn 하지 않는다. Node 는 자식에게 늘 표준 입출력을 넘기는데(stdio 'ignore' 면 NUL), Windows 11 의
 * conhost 는 이를 안의 프로그램에 그대로 넘겨 PowerShell 이 0xc0000142 로 시작하지 못하거나 입력 끝을 읽고 바로 닫혔다
 * (실측: 설치·로그인 창이 뜨자마자 사라짐. Windows 10 conhost 는 새 콘솔 입력을 줘서 드러나지 않았다).
 *
 * 대신 숨은 PowerShell 이 `Start-Process`(ShellExecute — 탐색기에서 실행하는 것과 같다)로 새 콘솔 창을 열고,
 * 그 프로세스 하나가 끝날 때까지 기다린다. `-Wait` 는 자식 프로세스까지 기다려 로그인 중 연 브라우저가 닫힐 때까지
 * 끝나지 않을 수 있어 `WaitForExit` 를 쓴다. 실행 파일 경로와 인자는 환경 변수로 넘긴다 — 명령줄에 넣어 경로의
 * 공백·특수문자가 다시 해석되지 않게 한다(셸을 거치지 않는 규칙).
 */

/** Windows PowerShell 실행 파일. PATH 에 기대지 않고 시스템 폴더의 것을 쓴다 */
export function powerShellExe(): string {
  return join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

const FILE_VAR = 'BABEL_WINDOW_FILE'
const ARGS_VAR = 'BABEL_WINDOW_ARGS'

/** 숨은 PowerShell 이 돌리는 고정 스크립트. 바뀌는 값은 환경 변수로만 받는다 */
const HELPER_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  `$p = Start-Process -FilePath $env:${FILE_VAR} -ArgumentList $env:${ARGS_VAR} -WorkingDirectory $env:USERPROFILE -PassThru`,
  // 핸들을 먼저 잡아 두어야 끝난 뒤 ExitCode 를 읽을 수 있다
  '$null = $p.Handle',
  '[Console]::Out.WriteLine($p.Id)',
  '$p.WaitForExit()',
  'exit $p.ExitCode'
].join('; ')

export type ConsoleWindow = {
  /** 창 프로세스와 그것을 기다리는 숨은 PowerShell 을 함께 끝낸다 */
  close: () => void
}

export function openConsoleWindow(input: {
  /** 실행할 프로그램(절대 경로) */
  file: string
  /** 명령줄 인자. 고정 문자열만 넘긴다(사용자 입력을 넣지 않는다) */
  args: string
  env: NodeJS.ProcessEnv
  /** 창이 닫혔다(또는 열지 못했다). 코드는 창 프로세스의 종료 코드, 모르면 null */
  onClose: (exitCode: number | null) => void
}): ConsoleWindow {
  const helper = spawn(powerShellExe(), ['-NoProfile', '-NonInteractive', '-Command', HELPER_SCRIPT], {
    env: { ...input.env, [FILE_VAR]: input.file, [ARGS_VAR]: input.args },
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true
  })

  // 숨은 PowerShell 이 첫 줄에 창 프로세스 id 를 쓴다 — 창을 닫을 때 쓴다
  let windowPid: number | null = null
  let output = ''
  helper.stdout?.on('data', (chunk: Buffer) => {
    if (windowPid !== null) return
    output += chunk.toString()
    const newline = output.indexOf('\n')
    if (newline < 0) return
    const pid = Number.parseInt(output.slice(0, newline).trim(), 10)
    if (Number.isInteger(pid) && pid > 0) windowPid = pid
  })

  let closed = false
  const finish = (code: number | null): void => {
    if (closed) return
    closed = true
    input.onClose(code)
  }
  helper.on('error', () => finish(null))
  helper.on('close', (code) => finish(code))

  return {
    close: () => {
      if (windowPid !== null) {
        try {
          process.kill(windowPid)
        } catch {
          // 이미 끝났다
        }
      }
      helper.kill()
    }
  }
}
