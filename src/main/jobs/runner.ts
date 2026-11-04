import type { JobLogEntry, JobView } from '@shared/schema/jobs'
import { fail, ok, type IpcResult } from '@shared/types'
import { JobScheduler, type JobSnapshot, type RunBatch, type SchedulerBatch } from './scheduler'
import { msg } from '../i18n'

/** 작업이 화면에 알리는 길. 렌더러로 보내는 이벤트에 그대로 묶인다. */
export type JobSink = {
  update: (view: JobView) => void
  log: (entry: JobLogEntry) => void
  /** 작업이 프로젝트 파일(용어집·컨텍스트 제안)을 썼다 */
  written: (file: string) => void
}

export type JobLog = (entry: Omit<JobLogEntry, 'at'>) => void

export type JobAction = 'pause' | 'resume' | 'cancel' | 'retry'

/** 작업 종류와 상관없이 다루는 제어 손잡이. 스케줄러의 배치 타입은 여기서 지운다. */
type JobControls = Pick<JobScheduler<SchedulerBatch>, 'snapshot' | 'pause' | 'resume' | 'retryNow' | 'cancel'>

type ActiveJob = {
  view: Omit<JobView, 'snapshot'>
  scheduler: JobControls
}


let active: ActiveJob | null = null

function isRunning(job: ActiveJob | null): job is ActiveJob {
  if (!job) return false
  const state = job.scheduler.snapshot().state
  return state !== 'done' && state !== 'cancelled'
}

/**
 * 작업은 종류와 상관없이 한 번에 하나만 돈다. 같은 사용량 한도를 나눠 쓰고, 같은 파일을 두 작업이 동시에 고치지 않게.
 * 돌고 있으면 그 사실을 알리는 실패를 돌려준다.
 */
export function ensureNoRunningJob(): IpcResult<null> {
  if (isRunning(active)) return fail('invalid-input', msg().jobLog.alreadyRunning(msg().job.title[active.view.kind]))
  return ok(null)
}

export function currentJob(): JobView | null {
  return active ? { ...active.view, snapshot: active.scheduler.snapshot() } : null
}

export function controlJob(action: JobAction): IpcResult<null> {
  if (!active) return fail('invalid-input', msg().jobLog.noJobRunning)
  const { scheduler } = active
  if (action === 'pause') scheduler.pause()
  else if (action === 'resume') scheduler.resume()
  else if (action === 'retry') scheduler.retryNow()
  else scheduler.cancel()
  return ok(null)
}

/** 프로젝트를 닫으면 그 프로젝트의 작업도 멈춘다. */
export function cancelActiveJob(): void {
  if (isRunning(active)) active.scheduler.cancel()
}

export function makeLog(sink: JobSink): JobLog {
  return (entry) => sink.log({ at: new Date().toISOString(), ...entry })
}

/**
 * 배치 작업을 띄운다. 끝나면 완료·실패·남은 행 수를 로그에 남긴다.
 * 호출하기 전에 ensureNoRunningJob 으로 확인한다.
 */
export function launchJob<B extends SchedulerBatch>(input: {
  view: Omit<JobView, 'snapshot'>
  batches: readonly B[]
  run: RunBatch<B>
  concurrency: number
  sink: JobSink
}): JobView {
  const { view, sink } = input
  const log = makeLog(sink)
  const scheduler = new JobScheduler<B>(input.batches, input.run, {
    concurrency: input.concurrency,
    onChange: (snapshot) => sink.update({ ...view, snapshot })
  })
  active = { view, scheduler }

  void scheduler.whenSettled().then((final: JobSnapshot) => {
    const text = msg()
    const count = (value: number): string => `${value}${text.job.unit[view.kind]}`
    log({
      level: final.failedRows > 0 ? 'warn' : 'ok',
      batchId: null,
      message: text.jobLog.jobEnded(
        text.job.title[view.kind],
        final.state === 'cancelled',
        count(final.doneRows),
        count(final.failedRows),
        count(final.totalRows - final.doneRows - final.failedRows)
      )
    })
  })

  scheduler.start()
  return { ...view, snapshot: scheduler.snapshot() }
}
