import { randomUUID } from 'node:crypto'
import { buildBatches, clampConcurrency, type TranslateBatch } from '@core/translate/batches'
import { filterTermsForTexts } from '@core/translate/glossary'
import { rowFingerprint } from '@core/translate/merge'
import { buildSystemPrompt } from '@core/translate/prompt'
import { selectRows } from '@core/translate/scope'
import type { JobView, StartTranslateInput } from '@shared/schema/jobs'
import type { OpenProject } from '@shared/schema/project'
import { fail, ok, type IpcResult } from '@shared/types'
import { qaContext } from '../project/qa'
import { loadGlossaryTerms, loadMaster, loadTermsWithoutConfirmedTranslation, loadTranslations } from '../project/store'
import { ensureNoRunningJob, launchJob, makeLog, type JobSink } from './runner'
import { runTranslateBatch } from './translate-batch'
import { msg } from '../i18n'

type JobBatch = TranslateBatch & { size: number }


export function startTranslateJob(
  project: OpenProject,
  input: StartTranslateInput,
  auth: { cliPath: string | null; configDir: string | null },
  sink: JobSink
): IpcResult<JobView> {
  const idle = ensureNoRunningJob()
  if (!idle.ok) return idle

  const { dir, config } = project
  if (!config.targetLanguages.includes(input.language)) {
    return fail('invalid-input', msg().errors.notTargetLanguage(input.language))
  }

  const master = loadMaster(dir)
  if (!master.ok) return master
  if (master.value.rows.length === 0) return fail('invalid-input', msg().jobLog.noSourceToTranslate)

  const translations = loadTranslations(dir, input.language)
  if (!translations.ok) return translations

  if (input.scope === 'selected' && input.keys.length === 0) {
    return fail('invalid-input', msg().jobLog.noRowsSelected)
  }
  const scoped = selectRows(master.value.rows, translations.value.rows, input.scope, new Set(input.keys))
  if (scoped.rows.length === 0) {
    const approved = scoped.skippedApproved.length
    return fail(
      'invalid-input',
      approved > 0 ? msg().jobLog.nothingButApproved(approved) : msg().jobLog.nothingInScope
    )
  }

  const log = makeLog(sink)
  const glossary = loadGlossaryTerms(dir, input.language)
  if (!glossary.ok) log({ level: 'warn', batchId: null, message: msg().jobLog.glossaryUnreadableTranslate, detail: glossary.error.message })
  const terms = glossary.ok ? glossary.value : []

  // 작업을 시작할 때 본 행. 작업 중 검토 화면에서 고친 행은 배치 결과로 덮지 않는다.
  const existing = new Map(translations.value.rows.map((row) => [row.key, row]))
  const baseline = new Map(scoped.rows.map((row) => [row.key, rowFingerprint(existing.get(row.key))]))

  const batches: JobBatch[] = buildBatches(scoped.rows, config.batch).map((batch) => ({ ...batch, size: batch.rows.length }))
  const concurrency = clampConcurrency(config.batch.concurrency)
  const skipped = scoped.skippedApproved.length
  const view: Omit<JobView, 'snapshot'> = {
    id: randomUUID(),
    kind: 'translate',
    language: input.language,
    summary: `${input.language} · ${msg().translate.scope[input.scope].label}`,
    model: input.model,
    effort: input.effort,
    startedAt: new Date().toISOString(),
    notes: skipped > 0 ? [msg().jobLog.approvedSkippedNote(skipped)] : []
  }

  const context = {
    dir,
    language: input.language,
    sourceLanguage: config.sourceLanguage,
    model: input.model,
    effort: input.effort,
    cliPath: auth.cliPath,
    configDir: auth.configDir,
    systemPrompt: buildSystemPrompt(config, input.language),
    glossary: terms,
    qa: qaContext(config, input.language, terms),
    baseline,
    log
  }

  log({
    level: 'info',
    batchId: null,
    message: msg().jobLog.translateStart(
      input.language,
      msg().translate.scope[input.scope].label,
      scoped.rows.length,
      batches.length,
      concurrency,
      input.model,
      input.effort,
      terms.length
    )
  })
  if (skipped > 0) log({ level: 'info', batchId: null, message: msg().jobLog.approvedSkipped(skipped) })
  // 대상 언어를 새로 늘리고 용어집을 채우기 전에 번역부터 돌리는 경우를 알린다. 이런 용어는 번역 없이(지침만) 들어가고 QA 도 보지 않는다
  const unconfirmed = loadTermsWithoutConfirmedTranslation(dir, input.language)
  if (unconfirmed.ok) {
    const used = filterTermsForTexts(
      unconfirmed.value.map((term) => ({ term })),
      scoped.rows.map((row) => row.source),
      config.sourceLanguage
    )
    if (used.length > 0) {
      log({
        level: 'warn',
        batchId: null,
        message: msg().jobLog.unconfirmedTerms(used.length, input.language),
        detail: used.map((term) => term.term).join(', ')
      })
    }
  }

  return ok(
    launchJob({
      view,
      batches,
      run: (batch, signal) => runTranslateBatch(context, batch, signal),
      concurrency,
      sink
    })
  )
}
