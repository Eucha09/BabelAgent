import { useEffect, useState } from 'react'
import type { JobControlInput, JobView } from '@shared/schema/jobs'
import { useT } from '../i18n'

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

/** 진행 중이거나 마지막으로 끝난 배치 작업(번역·컨텍스트 추정·용어 추출). */
export function JobProgress({ job, busy, onControl }: Props): React.JSX.Element {
  const { snapshot } = job
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (snapshot.resumeAt === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [snapshot.resumeAt])

  const t = useT()
  const total = Math.max(1, snapshot.totalRows)
  const donePercent = (snapshot.doneRows / total) * 100
  const failedPercent = (snapshot.failedRows / total) * 100
  const batchCount = (status: string): number => snapshot.batches.filter((batch) => batch.status === status).length

  return (
    <div className="card job-card">
      <div className="job-head">
        <h3>{t.job.title[job.kind]}</h3>
        <span className={`job-state ${snapshot.state}`}>{t.job.state[snapshot.state]}</span>
      </div>
      <p className="hint">
        {job.summary}
        {t.job.settingsUsed(t.translateOptions.model[job.model], t.translateOptions.effort[job.effort])}
        {job.notes.map((note) => ` · ${note}`).join('')}
      </p>

      <div className="job-bar" title={t.job.barTitle(snapshot.doneRows, snapshot.failedRows, snapshot.totalRows)}>
        <span className="job-bar-done" style={{ width: `${donePercent}%` }} />
        <span className="job-bar-failed" style={{ width: `${failedPercent}%` }} />
      </div>
      <div className="job-stats">
        <span>
          {snapshot.doneRows} / {snapshot.totalRows}
          {t.job.unit[job.kind]}
        </span>
        <span className="hint">
          {[
            t.job.batchesDone(batchCount('done')),
            // 한도 대기 중에 남은 배치는 중단 신호를 받고 CLI 를 닫는 중이다
            snapshot.state === 'waiting-limit' ? t.job.batchesStopping(batchCount('running')) : t.job.batchesRunning(batchCount('running')),
            t.job.batchesQueued(batchCount('queued')),
            t.job.batchesFailed(batchCount('failed'))
          ].join(' · ')}
        </span>
      </div>

      {snapshot.state === 'waiting-limit' ? (
        <div className="message">
          <strong>{t.job.limitStopped}</strong>
          <p className="hint">
            {snapshot.resumeAt !== null ? t.job.limitResumeIn(countdown(snapshot.resumeAt - now)) : t.job.limitManual}
          </p>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        {snapshot.state === 'running' ? (
          <button type="button" disabled={busy} onClick={() => onControl('pause')}>
            {t.job.pause}
          </button>
        ) : null}
        {snapshot.state === 'paused' ? (
          <button type="button" className="primary" disabled={busy} onClick={() => onControl('resume')}>
            {t.job.resume}
          </button>
        ) : null}
        {snapshot.state === 'waiting-limit' ? (
          <button type="button" className="primary" disabled={busy} onClick={() => onControl('retry')}>
            {t.job.retryNow}
          </button>
        ) : null}
        {snapshot.state !== 'done' && snapshot.state !== 'cancelled' ? (
          <button type="button" className="danger" disabled={busy} onClick={() => onControl('cancel')}>
            {t.job.cancel}
          </button>
        ) : null}
      </div>

      {snapshot.failures.length > 0 ? (
        <div className="job-failures">
          <strong>{t.job.failures(snapshot.failures.length)}</strong>
          {snapshot.failures.map((failure) => (
            <div key={failure.batchId} className="job-failure">
              <span className="mono">{t.job.batch(failure.batchId)}</span> {failure.reason}
              {failure.detail ? <pre>{failure.detail}</pre> : null}
            </div>
          ))}
          <p className="hint">{t.job.failuresHint}</p>
        </div>
      ) : null}
    </div>
  )
}
