/**
 * 앱이 쓰는 Claude Code 실행 파일의 출처.
 * - setting: 설정 화면에서 지정한 경로
 * - native: 공식 설치 스크립트가 설치한 것(%USERPROFILE%\.local\bin). 스스로 업데이트된다
 * - path: PATH 에서 찾은 것
 * - bundled: Agent SDK 패키지에 든 것. 개발 중에만 있다(설치판에는 넣지 않는다)
 */
export type ClaudeSource = 'setting' | 'native' | 'path' | 'bundled'

export type ClaudeExecutable = { path: string; source: ClaudeSource }

export type ClaudeCliStatus = {
  /** 고른 실행 파일. 아무것도 없으면 null */
  executable: ClaudeExecutable | null
  /** `claude --version` 으로 읽은 버전. 실행하지 못했으면 null */
  version: string | null
  /** 실행 파일은 있는데 버전을 읽지 못한 이유(응답 없음·종료 코드 등). 파일이 없거나 정상이면 null */
  runError: string | null
  /** 앱의 Agent SDK 가 맞춰진 Claude Code 버전(이보다 낮으면 일부 기능이 동작하지 않는다). 모르면 null */
  requiredVersion: string | null
  /** 버전이 요구 버전 이상인지. 둘 중 하나를 모르면 null */
  meetsRequired: boolean | null
  /** 앱이 업데이트를 돌릴 수 있는지(개발용 SDK 내장 실행 파일은 업데이트하지 않는다) */
  canUpdate: boolean
  /** 앱이 공식 설치 스크립트를 띄울 수 있는지(Windows) */
  canInstall: boolean
}

/** 업데이트 결과. 출력 문장을 해석하지 않고 앞뒤 버전을 비교해 정한다 */
export type ClaudeUpdateOutcome = 'updated' | 'current' | 'failed' | 'skipped'

export type ClaudeUpdateResult = {
  outcome: ClaudeUpdateOutcome
  before: string | null
  after: string | null
  /** 실패했을 때 CLI 출력 꼬리(해석하지 않고 그대로 보여 준다) */
  detail?: string
  status: ClaudeCliStatus
}

/** 설치 창이 닫혔다. 성공 여부는 화면이 상태를 다시 읽어 판단한다 */
export type ClaudeInstallDone = { exitCode: number | null }
