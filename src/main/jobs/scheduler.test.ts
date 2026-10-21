import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BACKOFF_MS } from './limit'
import { JobScheduler, type BatchOutcome, type SchedulerBatch } from './scheduler'

type Pending = { resolve: (outcome: BatchOutcome) => void; signal: AbortSignal }

/** 배치 결과를 테스트가 직접 정하는 가짜 실행기. 중단 신호를 받으면 aborted 로 끝난다. */
function fakeRunner() {
  const pending = new Map<number, Pending>()
  const started: number[] = []
  const run = (batch: SchedulerBatch, signal: AbortSignal): Promise<BatchOutcome> =>
    new Promise((resolve) => {
      started.push(batch.id)
      pending.set(batch.id, { resolve, signal })
      signal.addEventListener('abort', () => {
        pending.delete(batch.id)
        resolve({ kind: 'aborted' })
      })
    })
  const finish = (id: number, outcome: BatchOutcome): void => {
    const entry = pending.get(id)
    if (!entry) throw new Error(`배치 ${id} 는 실행 중이 아니다`)
    pending.delete(id)
    entry.resolve(outcome)
  }
  return { run, pending, started, finish }
}

/** 없으면 테스트를 깨뜨리는 꺼내기. 단언(!) 대신 쓴다. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} 이 없다`)
  return value
}

const FIRST_WAIT = must(BACKOFF_MS[0], '첫 대기')

const batches = (count: number, size = 10): SchedulerBatch[] =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1, size }))

/** 처리 대기 중인 프라미스를 흘려보낸다 */
const flush = (): Promise<void> => vi.advanceTimersByTimeAsync(0).then(() => undefined)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-20T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('JobScheduler 동시 실행', () => {
  it('작업자 수만큼만 동시에 돈다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(5), runner.run, { concurrency: 2 })
    job.start()
    expect(job.snapshot()).toMatchObject({ state: 'running', running: 2, queued: 3 })
    expect([...runner.pending.keys()]).toEqual([1, 2])

    runner.finish(1, { kind: 'done', written: 10 })
    await flush()
    expect([...runner.pending.keys()]).toEqual([2, 3])
  })

  it('모두 끝나면 done, 완료 행을 센다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(3), runner.run, { concurrency: 3 })
    job.start()
    for (const id of [1, 2, 3]) runner.finish(id, { kind: 'done', written: 10 })
    const final = await job.whenSettled()
    expect(final).toMatchObject({ state: 'done', doneRows: 30, failedRows: 0 })
  })

  it('실패한 배치는 사유를 남기고 나머지는 계속한다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(2), runner.run, { concurrency: 1 })
    job.start()
    runner.finish(1, { kind: 'failed', reason: '키 누락', detail: 'missing keys: a' })
    await flush()
    runner.finish(2, { kind: 'done', written: 10 })
    const final = await job.whenSettled()
    expect(final).toMatchObject({ state: 'done', doneRows: 10, failedRows: 10 })
    expect(final.failures).toEqual([{ batchId: 1, reason: '키 누락', detail: 'missing keys: a' }])
  })
})

describe('JobScheduler 일시정지', () => {
  it('일시정지하면 새 배치를 꺼내지 않고, 진행 중인 배치는 기록한다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(4), runner.run, { concurrency: 2 })
    job.start()
    job.pause()
    runner.finish(1, { kind: 'done', written: 10 })
    await flush()
    expect(job.snapshot()).toMatchObject({ state: 'paused', doneRows: 10, running: 1, queued: 2 })
    expect(runner.started).toEqual([1, 2])

    job.resume()
    expect(runner.started).toEqual([1, 2, 3])
  })
})

describe('JobScheduler 사용량 한도', () => {
  it('한 작업자가 한도에 걸리면 모든 작업자가 멈추고 대기한다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(4), runner.run, { concurrency: 2 })
    job.start()
    expect([...runner.pending.keys()]).toEqual([1, 2])

    runner.finish(1, { kind: 'limit', resetsAt: null })
    await flush()

    const waiting = job.snapshot()
    expect(waiting.state).toBe('waiting-limit')
    expect(waiting.running).toBe(0)
    // 진행 중이던 2번도 중단되어 기록 없이 큐로 돌아간다
    expect(runner.pending.size).toBe(0)
    expect(waiting.doneRows).toBe(0)
    expect(waiting.queued).toBe(4)
    expect(waiting.resumeAt).toBe(Date.now() + FIRST_WAIT)
  })

  it('대기 시간이 지나면 중단된 배치부터 다시 돌린다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(3), runner.run, { concurrency: 2 })
    job.start()
    runner.finish(1, { kind: 'limit', resetsAt: null })
    await flush()

    await vi.advanceTimersByTimeAsync(FIRST_WAIT - 1)
    expect(job.snapshot().state).toBe('waiting-limit')

    await vi.advanceTimersByTimeAsync(1)
    expect(job.snapshot()).toMatchObject({ state: 'running', running: 2, resumeAt: null })
    expect([...runner.pending.keys()]).toEqual([1, 2])

    for (const id of [1, 2]) runner.finish(id, { kind: 'done', written: 10 })
    await flush()
    runner.finish(3, { kind: 'done', written: 10 })
    const final = await job.whenSettled()
    expect(final).toMatchObject({ state: 'done', doneRows: 30, limitAttempts: 0 })
  })

  it('재설정 시각을 알면 그때까지 기다린다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(1), runner.run, { concurrency: 1 })
    job.start()
    const resetsAt = Date.now() + 90_000
    runner.finish(1, { kind: 'limit', resetsAt })
    await flush()
    expect(job.snapshot().resumeAt).toBe(resetsAt)
  })

  it('연달아 걸리면 1 → 2 → 5 → 10분, 그 뒤로는 사용자를 기다린다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(1), runner.run, { concurrency: 1 })
    job.start()

    const waits: (number | null)[] = []
    for (let attempt = 0; attempt < 5; attempt += 1) {
      runner.finish(1, { kind: 'limit', resetsAt: null })
      await flush()
      const { resumeAt } = job.snapshot()
      waits.push(resumeAt === null ? null : resumeAt - Date.now())
      if (resumeAt !== null) await vi.advanceTimersByTimeAsync(resumeAt - Date.now())
    }
    expect(waits).toEqual([...BACKOFF_MS, null])
    expect(job.snapshot()).toMatchObject({ state: 'waiting-limit', limitAttempts: 5 })

    // 자동 재시도가 멈춘 뒤에는 오래 기다려도 그대로다
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(job.snapshot().state).toBe('waiting-limit')

    job.retryNow()
    expect(job.snapshot().state).toBe('running')
    runner.finish(1, { kind: 'done', written: 10 })
    expect(await job.whenSettled()).toMatchObject({ state: 'done', doneRows: 10 })
  })

  it('지금 재시도는 대기를 건너뛴다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(1), runner.run, { concurrency: 1 })
    job.start()
    runner.finish(1, { kind: 'limit', resetsAt: null })
    await flush()

    job.retryNow()
    expect(job.snapshot()).toMatchObject({ state: 'running', running: 1, resumeAt: null })
  })

  it('두 작업자가 같은 한도에 걸려도 한 번만 센다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(2), runner.run, { concurrency: 2 })
    job.start()
    // 2번은 중단 신호보다 먼저 한도 결과를 냈다고 가정한다
    const second = must(runner.pending.get(2), '2번 배치')
    runner.finish(1, { kind: 'limit', resetsAt: null })
    second.resolve({ kind: 'limit', resetsAt: null })
    await flush()
    expect(job.snapshot()).toMatchObject({ state: 'waiting-limit', limitAttempts: 1, queued: 2 })
  })

  it('일시정지 중에 한도에 걸리면 대기가 끝나도 일시정지로 돌아간다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(2), runner.run, { concurrency: 1 })
    job.start()
    job.pause()
    runner.finish(1, { kind: 'limit', resetsAt: null })
    await flush()
    await vi.advanceTimersByTimeAsync(FIRST_WAIT)
    expect(job.snapshot()).toMatchObject({ state: 'paused', running: 0, queued: 2 })
  })
})

describe('JobScheduler 취소', () => {
  it('진행 중인 배치를 중단하고 남은 배치는 미완료로 둔다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(3), runner.run, { concurrency: 2 })
    job.start()
    job.cancel()
    const final = await job.whenSettled()
    expect(final).toMatchObject({ state: 'cancelled', doneRows: 0, running: 0, queued: 3 })
  })

  it('한도 대기 중에도 취소할 수 있다', async () => {
    const runner = fakeRunner()
    const job = new JobScheduler(batches(1), runner.run, { concurrency: 1 })
    job.start()
    runner.finish(1, { kind: 'limit', resetsAt: null })
    await flush()
    job.cancel()
    expect(await job.whenSettled()).toMatchObject({ state: 'cancelled', resumeAt: null })
    await vi.advanceTimersByTimeAsync(FIRST_WAIT)
    expect(job.snapshot().state).toBe('cancelled')
  })

  it('빈 작업은 바로 끝난다', async () => {
    const job = new JobScheduler([], fakeRunner().run, { concurrency: 2 })
    job.start()
    expect(await job.whenSettled()).toMatchObject({ state: 'done', totalBatches: 0 })
  })
})
