import { useState } from 'react'
import type { AgentCheckResult } from '@shared/schema/agent'
import type { AppSettings } from '@shared/schema/app-settings'
import { AccountCard, type AuthView } from '../AccountCard'
import type { UsageView } from '../UsageMeters'

export type SettingsPatch = { cliPath?: string | null; claudeConfigDir?: string | null }

type Props = {
  settings: AppSettings
  busy: boolean
  checking: boolean
  checkResult: AgentCheckResult | null
  onSave: (patch: SettingsPatch) => void
  onCheck: () => void
  auth: AuthView
  usage: UsageView
  onAuthRefresh: () => void
  onLoginStart: () => void
  onLoginInput: (text: string) => void
  onLoginCancel: () => void
  onLogout: () => void
}

function toValue(input: string): string | null {
  const trimmed = input.trim()
  return trimmed === '' ? null : trimmed
}

/** 설정 화면. M1에서 실제로 동작하는 유일한 단계 화면이다. */
export function Settings({
  settings,
  busy,
  checking,
  checkResult,
  onSave,
  onCheck,
  auth,
  usage,
  onAuthRefresh,
  onLoginStart,
  onLoginInput,
  onLoginCancel,
  onLogout
}: Props): React.JSX.Element {
  const [cliPath, setCliPath] = useState(settings.cliPath ?? '')
  const [configDir, setConfigDir] = useState(settings.claudeConfigDir ?? '')

  return (
    <div>
      <h2 className="screen-title">설정</h2>
      <p className="screen-desc">
        에이전트는 이 PC에 로그인된 Claude Code 계정을 그대로 사용합니다. 앱은 API 키를 저장하지
        않습니다.
      </p>

      <AccountCard
        auth={auth}
        usage={usage}
        busy={busy}
        onRefresh={onAuthRefresh}
        onLoginStart={onLoginStart}
        onLoginInput={onLoginInput}
        onLoginCancel={onLoginCancel}
        onLogout={onLogout}
      />

      <div className="card">
        <h3>Claude Code 연결</h3>

        <div className="field">
          <label htmlFor="cli-path">CLI 실행 파일 경로</label>
          <input
            id="cli-path"
            className="mono"
            value={cliPath}
            onChange={(event) => setCliPath(event.target.value)}
            placeholder="비워 두면 자동으로 찾습니다"
          />
          <p className="hint">
            비워 두면 SDK 기본 탐색을 씁니다. 패키징한 앱에서 경로를 찾지 못할 때 지정하세요.
          </p>
        </div>

        <div className="field">
          <label htmlFor="config-dir">설정 폴더 (로그인 정보 위치)</label>
          <input
            id="config-dir"
            className="mono"
            value={configDir}
            onChange={(event) => setConfigDir(event.target.value)}
            placeholder="비워 두면 CLAUDE_CONFIG_DIR 또는 ~/.claude"
          />
          <p className="hint">
            CLI는 이 폴더에서 로그인 정보를 읽습니다. 앱을 탐색기에서 실행하면 환경변수가 없어
            ~/.claude를 보게 되므로, 다른 폴더에 로그인했다면 그 경로를 지정하세요.
          </p>
        </div>

        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              onSave({ cliPath: toValue(cliPath), claudeConfigDir: toValue(configDir) })
            }
          >
            저장
          </button>
          <button type="button" disabled={busy || checking} onClick={onCheck}>
            {checking ? '확인 중…' : '연결 확인'}
          </button>
        </div>

        {checkResult?.ok ? (
          <div className="message ok">
            <strong>연결됨</strong>
            <dl className="dl" style={{ marginTop: 'var(--space-2)' }}>
              <dt>계정</dt>
              <dd>{checkResult.account.email ?? '(알 수 없음)'}</dd>
              <dt>조직</dt>
              <dd>{checkResult.account.organization ?? '-'}</dd>
              <dt>구독</dt>
              <dd>{checkResult.account.subscriptionType ?? '-'}</dd>
              <dt>백엔드</dt>
              <dd>{checkResult.account.apiProvider ?? '-'}</dd>
              <dt>CLI 경로</dt>
              <dd>{checkResult.account.cliPath ?? '(자동 탐색)'}</dd>
              <dt>설정 폴더</dt>
              <dd>{checkResult.account.configDir}</dd>
            </dl>
          </div>
        ) : null}

        {checkResult && !checkResult.ok ? (
          <div className="message error">
            <strong>{checkResult.error.message}</strong>
            {checkResult.error.kind === 'cli-not-found' ? (
              <p className="hint">
                명령 프롬프트에서 claude --version 이 동작하는지 확인하고, 그 실행 파일 경로를 위에
                입력하세요.
              </p>
            ) : null}
            {checkResult.error.kind === 'auth-failed' ? (
              <p className="hint">
                명령 프롬프트에서 claude 를 실행해 /login 으로 로그인하거나, 이미 로그인한 다른
                설정 폴더가 있다면 그 경로를 위에 입력하세요.
              </p>
            ) : null}
            {checkResult.error.detail ? <pre>{checkResult.error.detail}</pre> : null}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h3>인증 방식</h3>
        <p className="hint" style={{ marginBottom: 'var(--space-3)' }}>
          토큰은 앱이 아니라 Claude Code CLI가 보관합니다. 앱은 로그인 명령만 대신 실행합니다.
        </p>
        <div className="row">
          <input type="radio" checked readOnly style={{ width: 'auto' }} />
          <span>로그인된 Claude Code 계정</span>
        </div>
        <div className="row" style={{ marginTop: 'var(--space-2)' }}>
          <input type="radio" disabled readOnly style={{ width: 'auto' }} />
          <span style={{ color: 'var(--text-muted)' }}>API 키 (추후 배포용, 미구현)</span>
        </div>
        <p className="hint">
          현재 설정값: <code>{settings.auth.mode}</code>
        </p>
      </div>
    </div>
  )
}
