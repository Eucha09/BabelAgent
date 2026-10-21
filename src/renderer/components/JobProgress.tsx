import { useEffect, useState } from 'react'
import type { JobControlInput, JobState, JobView } from '@shared/schema/jobs'

const STATE_LABEL: Record<JobState, string> = {
  running: '진행 중',
  paused: '일시정지',
  'waiting-limit': '사용량 한도 대기',
  done: '완료',
  cancelled: '취소됨'
}

const SCOPE_LABEL: Record<JobView['scope'], string> = {
  all: '전체',
  untranslated: '미번역',
  stale: 'stale',
  selected: '선택 행'
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

type Props = {
  job: JobView
  busy: boolean
  onControl: (action: JobControlInput['action']) => void
}

/** 진행 중이거나 마지막으로 끝난 번역 작업. */
export function JobProgress({ job, busy, onControl }: Props): React.JSX.Element {
  const { snapshot } = job
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (snapshot.resumeAt === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [snapshot.resumeAt])

  const total = Math.max(1, snapshot.totalRows)
  const donePercent = (snapshot.doneRows / total) * 100
  const failedPercent = (snapshot.failedRows / total) * 100
  const batchCount = (status: string): number => snapshot.batches.filter((batch) => batch.status === status).length

  return (
    <div className="card job-card">
      <div className="job-head">
        <h3>번역 작업</h3>
        <span className={`job-state ${snapshot.state}`}>{STATE_LABEL[snapshot.state]}</span>
      </div>
      <p className="hint">
        {job.language} · {SCOPE_LABEL[job.scope]} · 모델 {job.model === 'default' ? '기본' : job.model}
        {job.skippedApproved > 0 ? ` · 승인 ${job.skippedApproved}행 제외` : ''}
      </p>

      <div className="job-bar" title={`완료 ${snapshot.doneRows} / 실패 ${snapshot.failedRows} / 전체 ${snapshot.totalRows}`}>
        <span className="job-bar-done" style={{ width: `${donePercent}%` }} />
        <span className="job-bar-failed" style={{ width: `${failedPercent}%` }} />
      </div>
      <div className="job-stats">
        <span>
          {snapshot.doneRows} / {snapshot.totalRows}행
        </span>
        <span className="hint">
          배치 완료 {batchCount('done')} ·{' '}
          {/* 한도 대기 중에 남은 배치는 중단 신호를 받고 CLI 를 닫는 중이다 */}
          {snapshot.state === 'waiting-limit' ? '정리 중' : '진행'} {batchCount('running')} · 대기{' '}
          {batchCount('queued')} · 실패{' '}
          {batchCount('failed')}
        </span>
      </div>

      {snapshot.state === 'waiting-limit' ? (
        <div className="message">
          <strong>사용량 한도에 걸려 모든 작업자를 멈췄습니다.</strong>
          <p className="hint">
            {snapshot.resumeAt !== null
              ? `${countdown(snapshot.resumeAt - now)} 뒤 자동으로 다시 시작합니다.`
              : '자동 재시도를 멈췄습니다. 한도가 풀린 뒤 직접 다시 시도하세요.'}{' '}
            진행 중이던 배치는 기록하지 않고 다시 돌립니다.
          </p>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        {snapshot.state === 'running' ? (
          <button type="button" disabled={busy} onClick={() => onControl('pause')}>
            일시정지
          </button>
        ) : null}
        {snapshot.state === 'paused' ? (
          <button type="button" className="primary" disabled={busy} onClick={() => onControl('resume')}>
            재개
          </button>
        ) : null}
        {snapshot.state === 'waiting-limit' ? (
          <button type="button" className="primary" disabled={busy} onClick={() => onControl('retry')}>
            지금 재시도
          </button>
        ) : null}
        {snapshot.state !== 'done' && snapshot.state !== 'cancelled' ? (
          <button type="button" className="danger" disabled={busy} onClick={() => onControl('cancel')}>
            취소
          </button>
        ) : null}
      </div>

      {snapshot.failures.length > 0 ? (
        <div className="job-failures">
          <strong>실패한 배치 ({snapshot.failures.length})</strong>
          {snapshot.failures.map((failure) => (
            <div key={failure.batchId} className="job-failure">
              <span className="mono">배치 {failure.batchId}</span> {failure.reason}
              {failure.detail ? <pre>{failure.detail}</pre> : null}
            </div>
          ))}
          <p className="hint">실패한 행은 기록되지 않았습니다. 같은 범위로 다시 번역하면 그 행만 다시 돕니다.</p>
        </div>
      ) : null}
    </div>
  )
}
