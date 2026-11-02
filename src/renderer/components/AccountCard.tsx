import { describeAuthMethod } from '@core/auth/method'
import type { AuthStatus, LoginMethod } from '@shared/schema/agent'
import type { IpcError } from '@shared/types'
import { UsageMeters, type UsageView } from './UsageMeters'

export type AuthView = {
  status: AuthStatus | null
  error: IpcError | null
  loading: boolean
  /** Claude Code 로그인 창이 열려 있는지 */
  loginRunning: boolean
}

type Props = {
  auth: AuthView
  usage: UsageView
  busy: boolean
  onRefresh: () => void
  onLoginStart: (method: LoginMethod) => void
  onLoginCancel: () => void
  onLogout: () => void
}

/**
 * 로그인 상태와 로그인·로그아웃. 로그인은 Claude Code 가 자기 창에서 Anthropic 의 흐름으로 진행하고,
 * 앱은 코드·토큰을 만지지 않는다(보관도 CLI 가 한다). 구독 계정과 Console(API 과금) 두 방식을 모두 연다.
 */
export function AccountCard({ auth, usage, busy, onRefresh, onLoginStart, onLoginCancel, onLogout }: Props): React.JSX.Element {
  const loggedIn = auth.status?.loggedIn === true
  const disabled = busy || auth.loading
  const method = describeAuthMethod(auth.status)

  return (
    <div className="card">
      <h3>계정</h3>

      {auth.loginRunning ? (
        <>
          <p className="hint">열린 Claude Code 창에서 로그인을 마치세요.</p>
          <div className="row" style={{ marginTop: 'var(--space-3)' }}>
            <button type="button" onClick={onLoginCancel}>
              로그인 창 닫기
            </button>
          </div>
        </>
      ) : (
        <>
          <dl className="dl">
            <dt>상태</dt>
            <dd>
              <span className={`chip-dot ${loggedIn ? 'ok' : 'error'}`} />{' '}
              {auth.loading ? '확인 중…' : loggedIn ? '로그인됨' : '로그아웃 상태'}
            </dd>
            <dt>계정</dt>
            <dd>{auth.status?.email ?? '-'}</dd>
            <dt>조직</dt>
            <dd>{auth.status?.orgName ?? '-'}</dd>
            <dt>인증 방식</dt>
            <dd>{loggedIn ? method.label : '-'}</dd>
            <dt>설정 폴더</dt>
            <dd>{auth.status?.configDir ?? '-'}</dd>
          </dl>

          {/* 사용량 한도(/usage)는 구독에만 있다. API 키는 요금으로 청구되므로 Console 에서 본다 */}
          {method.kind === 'subscription' ? <UsageMeters usage={usage} /> : null}
          {method.kind === 'api-key' ? (
            <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
              사용량은{' '}
              <a href="https://platform.claude.com/" target="_blank" rel="noreferrer">
                Claude Console
              </a>
              에서 확인하세요.
            </p>
          ) : null}
          {method.kind === 'provider' ? (
            <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
              사용량은 클라우드 제공자 콘솔에서 확인하세요.
            </p>
          ) : null}

          <div className="row" style={{ marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={loggedIn ? undefined : 'primary'}
              disabled={disabled}
              title="Claude Pro·Max 등 구독 계정으로 로그인합니다"
              onClick={() => onLoginStart('claudeai')}
            >
              Claude 계정(구독)으로 로그인
            </button>
            <button
              type="button"
              disabled={disabled}
              title="Anthropic Console 계정으로 로그인합니다. 사용량은 API 요금으로 청구됩니다"
              onClick={() => onLoginStart('console')}
            >
              Console(API 과금)로 로그인
            </button>
            <button type="button" disabled={disabled} onClick={onRefresh}>
              새로고침
            </button>
            <button type="button" disabled={disabled || !loggedIn} onClick={onLogout}>
              로그아웃
            </button>
          </div>

          {auth.error ? (
            <div className="message error">
              <strong>{auth.error.message}</strong>
              {auth.error.detail ? <pre>{auth.error.detail}</pre> : null}
            </div>
          ) : null}

        </>
      )}
    </div>
  )
}
