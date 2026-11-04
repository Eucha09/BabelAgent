import { describeAuthMethod } from '@core/auth/method'
import type { AuthStatus, LoginMethod } from '@shared/schema/agent'
import type { IpcError } from '@shared/types'
import { useT } from '../i18n'
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
  const t = useT()
  const loggedIn = auth.status?.loggedIn === true
  const disabled = busy || auth.loading
  const method = describeAuthMethod(auth.status, t)

  return (
    <div className="card">
      <h3>{t.account.title}</h3>

      {auth.loginRunning ? (
        <>
          <p className="hint">{t.account.loginWindowOpen}</p>
          <div className="row" style={{ marginTop: 'var(--space-3)' }}>
            <button type="button" onClick={onLoginCancel}>
              {t.account.closeLoginWindow}
            </button>
          </div>
        </>
      ) : (
        <>
          <dl className="dl">
            <dt>{t.account.status}</dt>
            <dd>
              <span className={`chip-dot ${loggedIn ? 'ok' : 'error'}`} />{' '}
              {auth.loading ? t.account.checking : loggedIn ? t.account.loggedIn : t.account.loggedOut}
            </dd>
            <dt>{t.account.account}</dt>
            <dd>{auth.status?.email ?? '-'}</dd>
            <dt>{t.account.organization}</dt>
            <dd>{auth.status?.orgName ?? '-'}</dd>
            <dt>{t.account.authMethod}</dt>
            <dd>{loggedIn ? method.label : '-'}</dd>
            <dt>{t.account.configDir}</dt>
            <dd>{auth.status?.configDir ?? '-'}</dd>
          </dl>

          {/* 사용량 한도(/usage)는 구독에만 있다. API 키는 요금으로 청구되므로 Console 에서 본다 */}
          {method.kind === 'subscription' ? <UsageMeters usage={usage} /> : null}
          {method.kind === 'api-key' ? (
            <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
              {t.account.consoleUsageBefore}
              <a href="https://platform.claude.com/" target="_blank" rel="noreferrer">
                Claude Console
              </a>
              {t.account.consoleUsageAfter}
            </p>
          ) : null}
          {method.kind === 'provider' ? (
            <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
              {t.account.providerUsage}
            </p>
          ) : null}

          <div className="row" style={{ marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={loggedIn ? undefined : 'primary'}
              disabled={disabled}
              title={t.account.loginSubscriptionTitle}
              onClick={() => onLoginStart('claudeai')}
            >
              {t.account.loginSubscription}
            </button>
            <button type="button" disabled={disabled} title={t.account.loginConsoleTitle} onClick={() => onLoginStart('console')}>
              {t.account.loginConsole}
            </button>
            <button type="button" disabled={disabled} onClick={onRefresh}>
              {t.account.refresh}
            </button>
            <button type="button" disabled={disabled || !loggedIn} onClick={onLogout}>
              {t.account.logout}
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
