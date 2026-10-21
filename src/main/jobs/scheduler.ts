import type { BatchStatus, JobFailure, JobSnapshot, JobState } from '@shared/schema/jobs'
import { limitDelay } from './limit'

export type { JobSnapshot, JobState }

/** 배치 하나를 실행한 결과. 실행기는 예외를 던지지 말고 이 중 하나로 돌려준다. */
export type BatchOutcome =
  | { kind: 'done'; written: number }
  | { kind: 'failed'; reason: string; detail?: string }
  | { kind: 'limit'; resetsAt: number | null }
  | { kind: 'aborted' }

export type SchedulerBatch = { id: number; size: number }

export type RunBatch<B> = (batch: B, signal: AbortSignal) => Promise<BatchOutcome>

export type Clock = {
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export type SchedulerOptions = {
  concurrency: number
  clock?: Clock
  onChange?: (snapshot: JobSnapshot) => void
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
}

/**
 * 배치 큐를 작업자 N개로 돌린다.
 * - 일시정지: 새 배치를 꺼내지 않는다. 진행 중인 배치는 끝까지 기록한다.
 * - 한도 오류: 진행 중인 배치를 모두 중단하고 큐 앞으로 되돌린 뒤 기다린다.
 *   재설정 시각까지, 모르면 1 → 2 → 5 → 10분. 그 뒤로는 retryNow()를 기다린다.
 * - 진행 상황은 끝난 배치로만 센다. 중단된 배치는 기록하지 않으므로 다시 돌리면 된다.
 */
export class JobScheduler<B extends SchedulerBatch> {
  private state: JobState = 'paused'
  private readonly queue: B[]
  private readonly status = new Map<number, BatchStatus>()
  private readonly active = new Map<number, AbortController>()
  private readonly failures: JobFailure[] = []
  private doneRows = 0
  private failedRows = 0
  private limitAttempts = 0
  private resumeAt: number | null = null
  private timer: unknown = null
  /** 한도에 걸릴 때 일시정지 중이었다면 대기가 끝나도 일시정지로 돌아간다. */
  private pausedBeforeLimit = false
  private readonly clock: Clock
  private readonly concurrency: number
  private settled: Promise<JobSnapshot>
  private resolveSettled: (snapshot: JobSnapshot) => void = () => undefined

  constructor(
    private readonly batches: readonly B[],
    private readonly run: RunBatch<B>,
    private readonly options: SchedulerOptions
  ) {
    this.queue = [...batches]
    for (const batch of batches) this.status.set(batch.id, 'queued')
    this.clock = options.clock ?? realClock
    this.concurrency = Math.max(1, options.concurrency)
    this.settled = new Promise((resolve) => {
      this.resolveSettled = resolve
    })
  }

  /** 작업이 끝나거나 취소되고, 진행 중인 배치가 모두 정리되면 풀린다. */
  whenSettled(): Promise<JobSnapshot> {
    return this.settled
  }

  start(): void {
    if (this.state !== 'paused' || this.isFinished()) return
    this.state = 'running'
    this.pump()
    this.finishIfIdle()
    this.emit()
  }

  pause(): void {
    if (this.state !== 'running') return
    this.state = 'paused'
    this.emit()
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.state = 'running'
    this.pump()
    this.finishIfIdle()
    this.emit()
  }

  /** 한도 대기를 건너뛰고 바로 다시 시도한다. 대기 단계 수는 줄이지 않는다. */
  retryNow(): void {
    if (this.state !== 'waiting-limit') return
    this.clearTimer()
    this.state = 'running'
    this.pump()
    this.emit()
  }

  cancel(): void {
    if (this.isFinished()) return
    this.state = 'cancelled'
    this.clearTimer()
    for (const controller of this.active.values()) controller.abort()
    this.finishIfIdle()
    this.emit()
  }

  snapshot(): JobSnapshot {
    let running = 0
    let queued = 0
    for (const value of this.status.values()) {
      if (value === 'running') running += 1
      if (value === 'queued') queued += 1
    }
    return {
      state: this.state,
      totalBatches: this.batches.length,
      totalRows: this.batches.reduce((sum, batch) => sum + batch.size, 0),
      doneRows: this.doneRows,
      failedRows: this.failedRows,
      running,
      queued,
      resumeAt: this.resumeAt,
      limitAttempts: this.limitAttempts,
      failures: [...this.failures],
      batches: this.batches.map((batch) => ({
        id: batch.id,
        size: batch.size,
        status: this.status.get(batch.id) ?? 'queued'
      }))
    }
  }

  private isFinished(): boolean {
    return this.state === 'done' || this.state === 'cancelled'
  }

  private pump(): void {
    while (this.state === 'running' && this.active.size < this.concurrency && this.queue.length > 0) {
      const batch = this.queue.shift()
      if (batch) this.launch(batch)
    }
  }

  private launch(batch: B): void {
    const controller = new AbortController()
    this.active.set(batch.id, controller)
    this.status.set(batch.id, 'running')
    this.run(batch, controller.signal)
      .catch((error: unknown): BatchOutcome => ({
        kind: 'failed',
        reason: '배치 실행 중 예외가 났습니다.',
        detail: error instanceof Error ? error.message : String(error)
      }))
      .then((outcome) => this.settle(batch, outcome))
  }

  private settle(batch: B, outcome: BatchOutcome): void {
    this.active.delete(batch.id)

    switch (outcome.kind) {
      case 'done':
        // 취소 요청과 엇갈려 끝난 배치도 이미 기록됐으므로 완료로 센다
        this.status.set(batch.id, 'done')
        this.doneRows += batch.size
        this.limitAttempts = 0
        break
      case 'failed':
        this.status.set(batch.id, 'failed')
        this.failedRows += batch.size
        this.failures.push(
          outcome.detail === undefined
            ? { batchId: batch.id, reason: outcome.reason }
            : { batchId: batch.id, reason: outcome.reason, detail: outcome.detail }
        )
        break
      case 'limit':
        this.requeue(batch)
        this.enterLimit(outcome.resetsAt)
        break
      case 'aborted':
        // 한도 대기로 중단된 배치는 다시 돌린다. 취소된 작업이면 미완료로 남긴다.
        if (this.state === 'cancelled') this.status.set(batch.id, 'queued')
        else this.requeue(batch)
        break
    }

    if (this.state === 'running') this.pump()
    this.finishIfIdle()
    this.emit()
  }

  private requeue(batch: B): void {
    this.status.set(batch.id, 'queued')
    // 원래 순서를 지키려고 앞쪽에 순번대로 끼운다
    const index = this.queue.findIndex((queued) => queued.id > batch.id)
    if (index < 0) this.queue.push(batch)
    else this.queue.splice(index, 0, batch)
  }

  private enterLimit(resetsAt: number | null): void {
    if (this.isFinished()) return
    // 다른 작업자도 같은 한도에 걸린 것이다. 한 번만 센다.
    if (this.state === 'waiting-limit') return

    this.pausedBeforeLimit = this.state === 'paused'
    this.limitAttempts += 1
    this.state = 'waiting-limit'
    for (const controller of this.active.values()) controller.abort()

    const now = this.clock.now()
    const delay = limitDelay(this.limitAttempts, resetsAt, now)
    this.clearTimer()
    if (delay === null) {
      this.resumeAt = null
      return
    }
    this.resumeAt = now + delay
    this.timer = this.clock.setTimeout(() => this.onLimitTimer(), delay)
  }

  private onLimitTimer(): void {
    this.timer = null
    this.resumeAt = null
    if (this.state !== 'waiting-limit') return
    this.state = this.pausedBeforeLimit ? 'paused' : 'running'
    this.pump()
    this.finishIfIdle()
    this.emit()
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer)
    this.timer = null
    this.resumeAt = null
  }

  private finishIfIdle(): void {
    if (this.active.size > 0) return
    if (this.state === 'cancelled') {
      this.resolveSettled(this.snapshot())
      return
    }
    if ((this.state === 'running' || this.state === 'paused') && this.queue.length === 0) {
      this.state = 'done'
      this.resolveSettled(this.snapshot())
    }
  }

  private emit(): void {
    this.options.onChange?.(this.snapshot())
  }
}
