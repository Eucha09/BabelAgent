/**
 * 앱(Babel Agent) 자체의 자동 업데이트 상태. Claude Code 업데이트(cli.ts)와는 별개다.
 * 새 버전은 GitHub Releases 에서 확인하고, 사용자가 [받기]를 눌러야 내려받는다.
 */
export type AppUpdateState =
  /** 개발 모드 등 업데이트를 확인하지 않는 환경 */
  | { kind: 'disabled'; reason: string }
  /** 아직 확인하지 않았다 */
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** 최신 버전이다. checkedAt 은 ISO 시각 */
  | { kind: 'current'; checkedAt: string }
  | { kind: 'available'; version: string; releaseDate: string | null }
  /** percent 는 0~100. 크기를 모르면 total 이 0 */
  | { kind: 'downloading'; version: string; percent: number; transferred: number; total: number }
  /** 받아 두었다. 다시 시작하거나 앱을 끌 때 설치된다 */
  | { kind: 'downloaded'; version: string }
  /** version 은 받던 새 버전(받는 중에 실패했으면 다시 받을 수 있다). 확인 단계에서 실패했으면 null */
  | { kind: 'error'; message: string; detail: string | null; version: string | null }

export type AppUpdateStatus = {
  /** 지금 실행 중인 앱 버전 */
  currentVersion: string
  state: AppUpdateState
  /** 릴리스 목록 페이지. 변경 내용을 보러 갈 때 연다 */
  releasesUrl: string
}
