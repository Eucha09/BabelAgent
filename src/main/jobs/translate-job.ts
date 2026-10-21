import { randomUUID } from 'node:crypto'
import { buildBatches, clampConcurrency, type TranslateBatch } from '@core/translate/batches'
import { buildSystemPrompt } from '@core/translate/prompt'
import { selectRows } from '@core/translate/scope'
import type { JobLogEntry, JobView, StartTranslateInput } from '@shared/schema/jobs'
import type { OpenProject } from '@shared/schema/project'
import { fail, ok, type IpcResult } from '@shared/types'
import { loadGlossaryTerms, loadMaster, loadTranslations } from '../project/store'
import { JobScheduler } from './scheduler'
import { runTranslateBatch } from './translate-batch'

type JobBatch = TranslateBatch & { size: number }

type ActiveJob = {
  view: Omit<JobView, 'snapshot'>
  scheduler: JobScheduler<JobBatch>
}

export type JobSink = {
  update: (view: JobView) => void
  log: (entry: JobLogEntry) => void
}

export type JobAction = 'pause' | 'resume' | 'cancel' | 'retry'

const SCOPE_LABEL: Record<StartTranslateInput['scope'], string> = {
  all: '전체',
  untranslated: '미번역',
  stale: 'stale',
  selected: '선택 행'
}

let active: ActiveJob | null = null

function isRunning(job: ActiveJob | null): job is ActiveJob {
  if (!job) return false
  const state = job.scheduler.snapshot().state
  return state !== 'done' && state !== 'cancelled'
}

export function currentJob(): JobView | null {
  return active ? { ...active.view, snapshot: active.scheduler.snapshot() } : null
}

/** 한 번에 작업 하나만 돈다. 같은 번역 파일을 두 작업이 동시에 고치지 않게. */
export function startTranslateJob(
  project: OpenProject,
  input: StartTranslateInput,
  auth: { cliPath: string | null; configDir: string | null },
  sink: JobSink
): IpcResult<JobView> {
  if (isRunning(active)) return fail('invalid-input', '이미 진행 중인 번역 작업이 있습니다.')

  const { dir, config } = project
  if (!config.targetLanguages.includes(input.language)) {
    return fail('invalid-input', `${input.language} 은 이 프로젝트의 대상 언어가 아닙니다.`)
  }

  const master = loadMaster(dir)
  if (!master.ok) return master
  if (master.value.rows.length === 0) return fail('invalid-input', '번역할 원문이 없습니다.')

  const translations = loadTranslations(dir, input.language)
  if (!translations.ok) return translations

  if (input.scope === 'selected' && input.keys.length === 0) {
    return fail('invalid-input', '선택한 행이 없습니다.')
  }
  const scoped = selectRows(master.value.rows, translations.value.rows, input.scope, new Set(input.keys))
  if (scoped.rows.length === 0) {
    const approved = scoped.skippedApproved.length
    return fail(
      'invalid-input',
      approved > 0 ? `번역할 행이 없습니다. 승인된 ${approved}행은 덮어쓰지 않습니다.` : '이 범위에는 번역할 행이 없습니다.'
    )
  }

  const log = (entry: Omit<JobLogEntry, 'at'>): void => sink.log({ at: new Date().toISOString(), ...entry })

  const glossary = loadGlossaryTerms(dir, input.language)
  if (!glossary.ok) log({ level: 'warn', batchId: null, message: '용어집을 읽지 못해 용어 없이 번역합니다.', detail: glossary.error.message })

  const batches: JobBatch[] = buildBatches(scoped.rows, config.batch).map((batch) => ({ ...batch, size: batch.rows.length }))
  const concurrency = clampConcurrency(config.batch.concurrency)
  const view: Omit<JobView, 'snapshot'> = {
    id: randomUUID(),
    language: input.language,
    scope: input.scope,
    model: input.model,
    startedAt: new Date().toISOString(),
    skippedApproved: scoped.skippedApproved.length
  }

  const context = {
    dir,
    language: input.language,
    model: input.model,
    cliPath: auth.cliPath,
    configDir: auth.configDir,
    systemPrompt: buildSystemPrompt(config, input.language),
    glossary: glossary.ok ? glossary.value : [],
    log
  }

  const scheduler = new JobScheduler<JobBatch>(batches, (batch, signal) => runTranslateBatch(context, batch, signal), {
    concurrency,
    onChange: (snapshot) => sink.update({ ...view, snapshot })
  })
  active = { view, scheduler }

  log({
    level: 'info',
    batchId: null,
    message: `번역 시작: ${input.language} · ${SCOPE_LABEL[input.scope]} · ${scoped.rows.length}행 · 배치 ${batches.length}개 · 작업자 ${concurrency}`
  })
  if (scoped.skippedApproved.length > 0) {
    log({ level: 'info', batchId: null, message: `승인된 ${scoped.skippedApproved.length}행은 건너뜁니다.` })
  }

  void scheduler.whenSettled().then((final) => {
    const verb = final.state === 'cancelled' ? '취소됨' : '끝'
    log({
      level: final.failedRows > 0 ? 'warn' : 'ok',
      batchId: null,
      message: `번역 ${verb}: 완료 ${final.doneRows}행 · 실패 ${final.failedRows}행 · 남음 ${final.totalRows - final.doneRows - final.failedRows}행`
    })
  })

  scheduler.start()
  return ok({ ...view, snapshot: scheduler.snapshot() })
}

export function controlJob(action: JobAction): IpcResult<null> {
  if (!active) return fail('invalid-input', '진행 중인 번역 작업이 없습니다.')
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
