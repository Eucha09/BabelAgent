import { useState } from 'react'
import type { AgentCheckResult, LoginMethod } from '@shared/schema/agent'
import type { AppSettings } from '@shared/schema/app-settings'
import type { AppUpdateStatus } from '@shared/schema/app-update'
import type { ClaudeCliStatus, ClaudeSource } from '@shared/schema/cli'
import { AccountCard, type AuthView } from '../AccountCard'
import { AppUpdateCard } from '../AppUpdateCard'
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
  onLoginStart: (method: LoginMethod) => void
  onLoginCancel: () => void
  onLogout: () => void
  /** 앱이 쓰는 Claude Code 실행 파일과 버전. 시작 확인 창이 끝나기 전에는 null */
  cli: ClaudeCliStatus | null
  /** 업데이트·설치 창이 진행 중인지 */
  cliBusy: boolean
  /** 번역 등 작업이 도는 중이면 업데이트하지 않는다 */
  jobRunning: boolean
  onCliUpdate: () => void
  onCliInstall: () => void
  /** 앱(Babel Agent) 업데이트 상태. 메인에서 읽기 전에는 null */
  appUpdate: AppUpdateStatus | null
  onAppUpdateCheck: () => void
  onAppUpdateDownload: () => void
  onAppUpdateCancel: () => void
  onAppUpdateInstall: () => void
}

const SOURCE_LABEL: Record<ClaudeSource, string> = {
  setting: '설정한 경로',
  native: '공식 설치(자동 업데이트)',
  path: 'PATH',
  bundled: '개발용(SDK 내장)'
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
  onLoginCancel,
  onLogout,
  cli,
  cliBusy,
  jobRunning,
  onCliUpdate,
  onCliInstall,
  appUpdate,
  onAppUpdateCheck,
  onAppUpdateDownload,
  onAppUpdateCancel,
  onAppUpdateInstall
}: Props): React.JSX.Element {
  const [cliPath, setCliPath] = useState(settings.cliPath ?? '')
  const [configDir, setConfigDir] = useState(settings.claudeConfigDir ?? '')

  return (
    <div>
      <h2 className="screen-title">설정</h2>

      <AccountCard
        auth={auth}
        usage={usage}
        busy={busy}
        onRefresh={onAuthRefresh}
        onLoginStart={onLoginStart}
        onLoginCancel={onLoginCancel}
        onLogout={onLogout}
      />

      <div className="card">
        <h3>Claude Code 연결</h3>

        <dl className="dl" style={{ marginBottom: 'var(--space-3)' }}>
          <dt>실행 파일</dt>
          <dd>{cli === null ? '확인 중…' : (cli.executable?.path ?? '찾지 못함')}</dd>
          <dt>출처</dt>
          <dd>{cli?.executable ? SOURCE_LABEL[cli.executable.source] : '-'}</dd>
          <dt>버전</dt>
          <dd>
            {cli === null ? '-' : (cli.version ?? (cli.runError ? `실행하지 못함 (${cli.runError})` : '실행하지 못함'))}
            {cli?.requiredVersion ? <span className="hint"> · 최소 {cli.requiredVersion}</span> : null}
          </dd>
        </dl>
        {cli?.meetsRequired === false ? (
          <p className="hint field-error">버전이 낮습니다. [업데이트 확인]을 누르세요.</p>
        ) : null}
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <button
            type="button"
            disabled={busy || cliBusy || jobRunning || !cli?.canUpdate}
            title={jobRunning ? '작업이 끝난 뒤에 업데이트할 수 있습니다' : undefined}
            onClick={onCliUpdate}
          >
            {cliBusy ? '진행 중…' : '업데이트 확인'}
          </button>
          {cli && (!cli.executable || cli.version === null) && cli.canInstall ? (
            <button type="button" className="primary" disabled={busy || cliBusy} onClick={onCliInstall}>
              Claude Code 설치
            </button>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="cli-path">실행 파일 경로</label>
          <input
            id="cli-path"
            className="mono"
            value={cliPath}
            onChange={(event) => setCliPath(event.target.value)}
            placeholder="비워 두면 자동으로 찾습니다"
          />
        </div>

        <div className="field">
          <label htmlFor="config-dir">설정 폴더</label>
          <input
            id="config-dir"
            className="mono"
            value={configDir}
            onChange={(event) => setConfigDir(event.target.value)}
            placeholder="비워 두면 CLAUDE_CONFIG_DIR 또는 ~/.claude"
          />
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
            {checkResult.account.email ? ` · ${checkResult.account.email}` : ''}
          </div>
        ) : null}

        {checkResult && !checkResult.ok ? (
          <div className="message error">
            <strong>{checkResult.error.message}</strong>
            {checkResult.error.kind === 'auth-failed' ? (
              <p className="hint">계정 카드에서 로그인하거나, 로그인한 설정 폴더를 지정하세요.</p>
            ) : null}
            {checkResult.error.detail ? <pre>{checkResult.error.detail}</pre> : null}
          </div>
        ) : null}
      </div>

      <AppUpdateCard
        status={appUpdate}
        jobRunning={jobRunning}
        onCheck={onAppUpdateCheck}
        onDownload={onAppUpdateDownload}
        onCancel={onAppUpdateCancel}
        onInstall={onAppUpdateInstall}
      />
    </div>
  )
}
