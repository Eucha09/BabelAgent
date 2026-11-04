import type { Messages } from '@shared/i18n'
import type { AppUpdateState, AppUpdateStatus } from '@shared/schema/app-update'
import { useI18n } from '../i18n'

type Props = {
  /** 메인에서 읽기 전에는 null */
  status: AppUpdateStatus | null
  /** 번역 등 작업이 도는 중이면 다시 시작하지 않는다 */
  jobRunning: boolean
  onCheck: () => void
  onDownload: () => void
  onCancel: () => void
  onInstall: () => void
}

function megabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}

function describeState(state: AppUpdateState, t: Messages, locale: string): string {
  switch (state.kind) {
    case 'disabled':
      return state.reason
    case 'idle':
      return t.appUpdate.idle
    case 'checking':
      return t.appUpdate.checking
    case 'current':
      return t.appUpdate.current(new Date(state.checkedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }))
    case 'available':
      return t.appUpdate.available(state.version)
    case 'downloading':
      return state.total > 0
        ? t.appUpdate.downloading(state.version, state.percent, megabytes(state.transferred), megabytes(state.total))
        : t.appUpdate.downloadingUnknown(state.version)
    case 'downloaded':
      return t.appUpdate.downloaded(state.version)
    case 'error':
      return state.message
  }
}

/** 받을 수 있는 새 버전. 받다가 실패했으면 그 버전을 다시 받을 수 있다 */
function pendingVersion(state: AppUpdateState): string | null {
  if (state.kind === 'available' || state.kind === 'downloading' || state.kind === 'downloaded') return state.version
  if (state.kind === 'error') return state.version
  return null
}

/** 설정 화면의 앱 업데이트 카드. 새 버전은 GitHub Releases 에서 확인하고, [받기]를 눌러야 내려받는다. */
export function AppUpdateCard({ status, jobRunning, onCheck, onDownload, onCancel, onInstall }: Props): React.JSX.Element {
  const { t, locale } = useI18n()
  const state = status?.state ?? null
  const version = state ? pendingVersion(state) : null
  const canCheck = state !== null && (state.kind === 'idle' || state.kind === 'current' || state.kind === 'available' || state.kind === 'error')
  const downloadLabel =
    state?.kind === 'available'
      ? t.appUpdate.download
      : state?.kind === 'error' && state.version !== null
        ? t.appUpdate.downloadAgain
        : null

  return (
    <div className="card">
      <h3>{t.appUpdate.title}</h3>

      <dl className="dl" style={{ marginBottom: 'var(--space-3)' }}>
        <dt>{t.appUpdate.currentVersion}</dt>
        <dd>{status?.currentVersion ?? '-'}</dd>
        <dt>{t.appUpdate.status}</dt>
        <dd className={state?.kind === 'error' ? 'field-error' : undefined}>{state ? describeState(state, t, locale) : t.appUpdate.checking}</dd>
      </dl>

      {state?.kind === 'downloading' ? (
        <div className="meter-track app-update-track">
          <span className="meter-fill" style={{ width: `${state.percent}%` }} />
        </div>
      ) : null}

      {state?.kind === 'error' && state.detail ? <pre className="login-log">{state.detail}</pre> : null}

      <div className="row">
        <button type="button" disabled={!canCheck} onClick={onCheck}>
          {state?.kind === 'checking' ? t.appUpdate.checking : t.appUpdate.check}
        </button>
        {downloadLabel ? (
          <button type="button" className="primary" onClick={onDownload}>
            {downloadLabel}
          </button>
        ) : null}
        {state?.kind === 'downloading' ? (
          <button type="button" onClick={onCancel}>
            {t.appUpdate.cancelDownload}
          </button>
        ) : null}
        {state?.kind === 'downloaded' ? (
          <button
            type="button"
            className="primary"
            disabled={jobRunning}
            title={jobRunning ? t.appUpdate.installAfterJob : undefined}
            onClick={onInstall}
          >
            {t.appUpdate.install}
          </button>
        ) : null}
        {status ? (
          <a href={version ? `${status.releasesUrl}/tag/v${version}` : status.releasesUrl} target="_blank" rel="noreferrer">
            {version ? t.appUpdate.releaseNotes : t.appUpdate.releases}
          </a>
        ) : null}
      </div>
    </div>
  )
}
