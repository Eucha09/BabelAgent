import type { AgentCheckResult } from '@shared/schema/agent'
import type { AuthView } from './AccountCard'
import type { OpenProject } from '@shared/schema/project'

type Props = {
  project: OpenProject | null
  checkResult: AgentCheckResult | null
  checking: boolean
  auth: AuthView
  sessionId: string | null
  message: string | null
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

export function StatusBar({
  project,
  checkResult,
  checking,
  auth,
  sessionId,
  message
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
    </footer>
  )
}
