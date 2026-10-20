import { useState } from 'react'
import type { AuthStatus } from '@shared/schema/agent'
import type { IpcError } from '@shared/types'
import { UsageMeters, type UsageView } from './UsageMeters'

export type AuthView = {
  status: AuthStatus | null
  error: IpcError | null
  loading: boolean
  loginRunning: boolean
  loginLog: string
}

type Props = {
  auth: AuthView
  usage: UsageView
  busy: boolean
  onRefresh: () => void
  onLoginStart: () => void
  onLoginInput: (text: string) => void
  onLoginCancel: () => void
  onLogout: () => void
}

/** 구독 계정 로그인과 현재 로그인 상태. 토큰은 앱이 아니라 CLI가 보관한다. */
export function AccountCard({
  auth,
  usage,
  busy,
  onRefresh,
  onLoginStart,
  onLoginInput,
  onLoginCancel,
  onLogout
}: Props): React.JSX.Element {
  const [code, setCode] = useState('')
  const loginUrl = auth.loginLog.match(/https:\/\/\S+/)?.[0] ?? null
  const loggedIn = auth.status?.loggedIn === true

  return (
    <div className="card">
      <h3>계정</h3>

      {auth.loginRunning ? (
        <>
          <p className="hint">
            브라우저에서 로그인을 끝내세요. 코드를 보여주는 화면이 나오면 아래에 붙여넣고 보내면
            됩니다.
          </p>
          {loginUrl ? (
            <div className="field">
              <label>브라우저가 열리지 않으면 이 주소로 접속하세요</label>
              <pre className="login-url">{loginUrl}</pre>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="login-code">코드 붙여넣기 (필요한 경우)</label>
            <input
              id="login-code"
              className="mono"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="브라우저가 보여준 코드"
            />
          </div>
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={code.trim() === ''}
              onClick={() => {
                onLoginInput(code.trim())
                setCode('')
              }}
            >
              코드 보내기
            </button>
            <button type="button" onClick={onLoginCancel}>
              로그인 취소
            </button>
          </div>
          {auth.loginLog ? <pre className="login-log">{auth.loginLog}</pre> : null}
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
            <dt>구독</dt>
            <dd>{auth.status?.subscriptionType ?? '-'}</dd>
            <dt>인증 방식</dt>
            <dd>{auth.status?.authMethod ?? '-'}</dd>
            <dt>설정 폴더</dt>
            <dd>{auth.status?.configDir ?? '-'}</dd>
            <dt>CLI 경로</dt>
            <dd>{auth.status?.cliPath ?? '-'}</dd>
          </dl>

          {loggedIn ? <UsageMeters usage={usage} /> : null}

          <div className="row" style={{ marginTop: 'var(--space-3)' }}>
            <button
              type="button"
              className="primary"
              disabled={busy || auth.loading}
              onClick={onLoginStart}
            >
              {loggedIn ? '다른 계정으로 로그인' : '구독 계정으로 로그인'}
            </button>
            <button type="button" disabled={busy || auth.loading} onClick={onRefresh}>
              상태 새로고침
            </button>
            <button type="button" disabled={busy || auth.loading || !loggedIn} onClick={onLogout}>
              로그아웃
            </button>
          </div>

          {auth.error ? (
            <div className="message error">
              <strong>{auth.error.message}</strong>
              {auth.error.detail ? <pre>{auth.error.detail}</pre> : null}
            </div>
          ) : null}

          {!auth.error && auth.loginLog ? <pre className="login-log">{auth.loginLog}</pre> : null}
        </>
      )}
    </div>
  )
}
