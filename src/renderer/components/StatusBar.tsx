import type { Messages } from '@shared/i18n'
import type { AgentCheckResult } from '@shared/schema/agent'
import type { AppUpdateStatus } from '@shared/schema/app-update'
import type { AuthView } from './AccountCard'
import type { OpenProject } from '@shared/schema/project'
import { useT } from '../i18n'

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
  auth: AuthView,
  t: Messages
): { tone: string; value: string } {
  if (checking) return { tone: 'warn', value: t.statusBar.checking }
  if (checkResult) {
    if (checkResult.ok) return { tone: 'ok', value: checkResult.account.email ?? t.statusBar.connected }
    return { tone: 'error', value: checkResult.error.kind }
  }
  if (auth.loading) return { tone: '', value: t.statusBar.checking }
  if (auth.status?.loggedIn) return { tone: 'ok', value: auth.status.email ?? t.statusBar.loggedIn }
  return { tone: 'error', value: t.statusBar.loggedOut }
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
  const t = useT()
  const { state } = status
  const className = push ? 'stat push app-update-chip' : 'stat app-update-chip'
  if (state.kind === 'available') {
    return (
      <span className={className}>
        <span className="chip-dot warn" />
        <span className="stat-value">{t.statusBar.newVersion(state.version)}</span>
        <button type="button" className="ghost" onClick={onDownload}>
          {t.statusBar.download}
        </button>
      </span>
    )
  }
  if (state.kind === 'downloading') {
    return (
      <span className={className}>
        <span className="stat-label">{t.statusBar.downloading}</span>
        <span className="stat-value">{state.percent}%</span>
      </span>
    )
  }
  if (state.kind === 'downloaded') {
    return (
      <span className={className}>
        <span className="chip-dot ok" />
        <span className="stat-value">{t.statusBar.ready(state.version)}</span>
        <button type="button" className="ghost" onClick={onInstall}>
          {t.statusBar.install}
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
  const t = useT()
  const agent = agentState(checkResult, checking, auth, t)

  return (
    <footer className="status-bar">
      <span className="stat">
        <span className={`chip-dot ${agent.tone}`} />
        <span className="stat-label">{t.statusBar.account}</span>
        <span className="stat-value">{agent.value}</span>
      </span>

      <span className="stat">
        <span className="stat-label">{t.statusBar.project}</span>
        <span className="stat-value">{project ? project.config.name : t.statusBar.none}</span>
      </span>

      <span className="stat">
        <span className="stat-label">{t.statusBar.targets}</span>
        <span className="stat-value">{project ? project.config.targetLanguages.length : 0}</span>
      </span>

      <span className="stat">
        <span className="stat-label">{t.statusBar.session}</span>
        <span className="stat-value">{sessionId ? t.statusBar.sessionKept : t.statusBar.none}</span>
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
