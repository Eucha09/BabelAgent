import type { AgentCheckResult } from '@shared/schema/agent'
import type { AppUpdateStatus } from '@shared/schema/app-update'
import type { AuthView } from './AccountCard'
import type { OpenProject } from '@shared/schema/project'

type Props = {
  project: OpenProject | null
  checkResult: AgentCheckResult | null
  checking: boolean
  auth: AuthView
  sessionId: string | null
  message: string | null
  appUpdate: AppUpdateStatus | null
  /** 새 버전 받기 */
  onAppUpdateDownload: () => void
  /** 받아 둔 업데이트를 설치하려고 다시 시작 */
  onAppUpdateInstall: () => void
}

/** 연결 확인을 눌렀으면 그 결과를, 아니면 로그인 상태를 보여준다. */
function agentState(
  checkResult: AgentCheckResult | null,
  checking: boolean,
  auth: AuthView
): { tone: string; value: string } {
  if (checking) return { tone: 'warn', value: '확인 중' }
  if (checkResult) {
    if (checkResult.ok) return { tone: 'ok', value: checkResult.account.email ?? '연결됨' }
    return { tone: 'error', value: checkResult.error.kind }
  }
  if (auth.loading) return { tone: '', value: '확인 중' }
  if (auth.status?.loggedIn) return { tone: 'ok', value: auth.status.email ?? '로그인됨' }
  return { tone: 'error', value: '로그아웃 상태' }
}

/**
 * 앱 업데이트 알림. 새 버전이 있거나 받는 중이거나 받아 두었을 때만 보인다.
 * 확인 실패는 여기 띄우지 않는다 — 오프라인으로 켤 때마다 알림이 뜨면 성가시다. 설정 화면 카드에서 보여 준다.
 */
function AppUpdateChip({
  status,
  push,
  onDownload,
  onInstall
}: {
  status: AppUpdateStatus
  push: boolean
  onDownload: () => void
  onInstall: () => void
}): React.JSX.Element | null {
  const { state } = status
  const className = push ? 'stat push app-update-chip' : 'stat app-update-chip'
  if (state.kind === 'available') {
    return (
      <span className={className}>
        <span className="chip-dot warn" />
        <span className="stat-value">새 버전 {state.version}</span>
        <button type="button" className="ghost" onClick={onDownload}>
          받기
        </button>
      </span>
    )
  }
  if (state.kind === 'downloading') {
    return (
      <span className={className}>
        <span className="stat-label">업데이트 받는 중</span>
        <span className="stat-value">{state.percent}%</span>
      </span>
    )
  }
  if (state.kind === 'downloaded') {
    return (
      <span className={className}>
        <span className="chip-dot ok" />
        <span className="stat-value">{state.version} 준비됨</span>
        <button type="button" className="ghost" onClick={onInstall}>
          다시 시작해 설치
        </button>
      </span>
    )
  }
  return null
}

export function StatusBar({
  project,
  checkResult,
  checking,
  auth,
  sessionId,
  message,
  appUpdate,
  onAppUpdateDownload,
  onAppUpdateInstall
}: Props): React.JSX.Element {
  const agent = agentState(checkResult, checking, auth)

  return (
    <footer className="status-bar">
      <span className="stat">
        <span className={`chip-dot ${agent.tone}`} />
        <span className="stat-label">계정</span>
        <span className="stat-value">{agent.value}</span>
      </span>

      <span className="stat">
        <span className="stat-label">프로젝트</span>
        <span className="stat-value">{project ? project.config.name : '없음'}</span>
      </span>

      <span className="stat">
        <span className="stat-label">대상 언어</span>
        <span className="stat-value">{project ? project.config.targetLanguages.length : 0}</span>
      </span>

      <span className="stat">
        <span className="stat-label">세션</span>
        <span className="stat-value">{sessionId ? '유지' : '없음'}</span>
      </span>

      {message ? (
        <span className="stat push">
          <span className="stat-value">{message}</span>
        </span>
      ) : null}

      {appUpdate ? (
        <AppUpdateChip
          status={appUpdate}
          push={!message}
          onDownload={onAppUpdateDownload}
          onInstall={onAppUpdateInstall}
        />
      ) : null}
    </footer>
  )
}
