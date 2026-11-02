import type { AppUpdateState, AppUpdateStatus } from '@shared/schema/app-update'

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

function describeState(state: AppUpdateState): string {
  switch (state.kind) {
    case 'disabled':
      return state.reason
    case 'idle':
      return '아직 확인하지 않았습니다.'
    case 'checking':
      return '확인 중…'
    case 'current':
      return `최신 버전입니다 (${new Date(state.checkedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 확인).`
    case 'available':
      return `새 버전 ${state.version} 이 있습니다.`
    case 'downloading':
      return state.total > 0
        ? `${state.version} 받는 중 ${state.percent}% (${megabytes(state.transferred)} / ${megabytes(state.total)} MB)`
        : `${state.version} 받는 중…`
    case 'downloaded':
      return `${state.version} 을 받아 두었습니다. 다시 시작하면 설치됩니다.`
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
  const state = status?.state ?? null
  const version = state ? pendingVersion(state) : null
  const canCheck = state !== null && (state.kind === 'idle' || state.kind === 'current' || state.kind === 'available' || state.kind === 'error')
  const downloadLabel =
    state?.kind === 'available' ? '받기' : state?.kind === 'error' && state.version !== null ? '다시 받기' : null

  return (
    <div className="card">
      <h3>앱 업데이트</h3>

      <dl className="dl" style={{ marginBottom: 'var(--space-3)' }}>
        <dt>지금 버전</dt>
        <dd>{status?.currentVersion ?? '-'}</dd>
        <dt>상태</dt>
        <dd className={state?.kind === 'error' ? 'field-error' : undefined}>{state ? describeState(state) : '확인 중…'}</dd>
      </dl>

      {state?.kind === 'downloading' ? (
        <div className="meter-track app-update-track">
          <span className="meter-fill" style={{ width: `${state.percent}%` }} />
        </div>
      ) : null}

      {state?.kind === 'error' && state.detail ? <pre className="login-log">{state.detail}</pre> : null}

      <div className="row">
        <button type="button" disabled={!canCheck} onClick={onCheck}>
          {state?.kind === 'checking' ? '확인 중…' : '업데이트 확인'}
        </button>
        {downloadLabel ? (
          <button type="button" className="primary" onClick={onDownload}>
            {downloadLabel}
          </button>
        ) : null}
        {state?.kind === 'downloading' ? (
          <button type="button" onClick={onCancel}>
            받기 멈춤
          </button>
        ) : null}
        {state?.kind === 'downloaded' ? (
          <button
            type="button"
            className="primary"
            disabled={jobRunning}
            title={jobRunning ? '작업이 끝난 뒤에 다시 시작할 수 있습니다' : undefined}
            onClick={onInstall}
          >
            다시 시작해 설치
          </button>
        ) : null}
        {status ? (
          <a href={version ? `${status.releasesUrl}/tag/v${version}` : status.releasesUrl} target="_blank" rel="noreferrer">
            {version ? '변경 내용 보기' : '릴리스 목록'}
          </a>
        ) : null}
      </div>
    </div>
  )
}
