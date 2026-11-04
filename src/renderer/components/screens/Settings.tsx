import { useState } from 'react'
import { UI_LANGUAGE_NAME, UI_LANGUAGES, isUiLanguage, type Messages, type UiLanguage } from '@shared/i18n'
import type { AgentCheckResult, LoginMethod } from '@shared/schema/agent'
import type { AppSettings } from '@shared/schema/app-settings'
import type { AppUpdateStatus } from '@shared/schema/app-update'
import type { ClaudeCliStatus, ClaudeSource } from '@shared/schema/cli'
import { useI18n } from '../../i18n'
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
  /** 화면 언어를 고르면 바로 앱 설정에 저장한다 */
  onLanguageChange: (language: UiLanguage) => void
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

function sourceLabel(source: ClaudeSource, t: Messages): string {
  switch (source) {
    case 'setting':
      return t.claudeCode.sourceSetting
    case 'native':
      return t.claudeCode.sourceNative
    case 'path':
      return t.claudeCode.sourcePath
    case 'bundled':
      return t.claudeCode.sourceBundled
  }
}

function toValue(input: string): string | null {
  const trimmed = input.trim()
  return trimmed === '' ? null : trimmed
}

/** 설정 화면. 화면 언어, 계정, Claude Code 연결, 앱 업데이트. */
export function Settings({
  settings,
  busy,
  checking,
  checkResult,
  onSave,
  onCheck,
  onLanguageChange,
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
  const { language, t } = useI18n()
  const [cliPath, setCliPath] = useState(settings.cliPath ?? '')
  const [configDir, setConfigDir] = useState(settings.claudeConfigDir ?? '')

  return (
    <div>
      <h2 className="screen-title">{t.settings.title}</h2>

      <div className="card">
        <h3>{t.settings.language}</h3>
        <select
          className="language-setting"
          value={language}
          aria-label={t.settings.language}
          onChange={(event) => {
            const next = event.target.value
            if (isUiLanguage(next)) onLanguageChange(next)
          }}
        >
          {UI_LANGUAGES.map((item) => (
            <option key={item} value={item}>
              {UI_LANGUAGE_NAME[item]}
            </option>
          ))}
        </select>
      </div>

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
        <h3>{t.claudeCode.title}</h3>

        <dl className="dl" style={{ marginBottom: 'var(--space-3)' }}>
          <dt>{t.claudeCode.executable}</dt>
          <dd>{cli === null ? t.claudeCode.checking : (cli.executable?.path ?? t.claudeCode.notFound)}</dd>
          <dt>{t.claudeCode.source}</dt>
          <dd>{cli?.executable ? sourceLabel(cli.executable.source, t) : '-'}</dd>
          <dt>{t.claudeCode.version}</dt>
          <dd>
            {cli === null
              ? '-'
              : (cli.version ?? (cli.runError ? t.claudeCode.cannotRunWith(cli.runError) : t.claudeCode.cannotRun))}
            {cli?.requiredVersion ? <span className="hint">{t.claudeCode.minVersion(cli.requiredVersion)}</span> : null}
          </dd>
        </dl>
        {cli?.meetsRequired === false ? <p className="hint field-error">{t.claudeCode.versionTooLow}</p> : null}
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <button
            type="button"
            disabled={busy || cliBusy || jobRunning || !cli?.canUpdate}
            title={jobRunning ? t.claudeCode.updateAfterJob : undefined}
            onClick={onCliUpdate}
          >
            {cliBusy ? t.claudeCode.inProgress : t.claudeCode.checkUpdate}
          </button>
          {cli && (!cli.executable || cli.version === null) && cli.canInstall ? (
            <button type="button" className="primary" disabled={busy || cliBusy} onClick={onCliInstall}>
              {t.claudeCode.install}
            </button>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="cli-path">{t.claudeCode.executablePath}</label>
          <input
            id="cli-path"
            className="mono"
            value={cliPath}
            onChange={(event) => setCliPath(event.target.value)}
            placeholder={t.claudeCode.executablePathPlaceholder}
          />
        </div>

        <div className="field">
          <label htmlFor="config-dir">{t.claudeCode.configDir}</label>
          <input
            id="config-dir"
            className="mono"
            value={configDir}
            onChange={(event) => setConfigDir(event.target.value)}
            placeholder={t.claudeCode.configDirPlaceholder}
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
            {t.claudeCode.save}
          </button>
          <button type="button" disabled={busy || checking} onClick={onCheck}>
            {checking ? t.claudeCode.checking : t.claudeCode.check}
          </button>
        </div>

        {checkResult?.ok ? (
          <div className="message ok">
            <strong>{t.claudeCode.connected}</strong>
            {checkResult.account.email ? ` · ${checkResult.account.email}` : ''}
          </div>
        ) : null}

        {checkResult && !checkResult.ok ? (
          <div className="message error">
            <strong>{checkResult.error.message}</strong>
            {checkResult.error.kind === 'auth-failed' ? <p className="hint">{t.claudeCode.authFailedHint}</p> : null}
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
