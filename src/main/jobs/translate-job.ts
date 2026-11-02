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

type JobBatch = TranslateBatch & { size: number }

const SCOPE_LABEL: Record<StartTranslateInput['scope'], string> = {
  all: '전체',
  untranslated: '미번역',
  stale: 'stale',
  selected: '선택 행'
}

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

  const log = makeLog(sink)
  const glossary = loadGlossaryTerms(dir, input.language)
  if (!glossary.ok) log({ level: 'warn', batchId: null, message: '용어집을 읽지 못해 용어 없이 번역합니다.', detail: glossary.error.message })
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
    summary: `${input.language} · ${SCOPE_LABEL[input.scope]}`,
    model: input.model,
    effort: input.effort,
    startedAt: new Date().toISOString(),
    notes: skipped > 0 ? [`승인 ${skipped}행 제외`] : []
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
    message: `번역 시작: ${input.language} · ${SCOPE_LABEL[input.scope]} · ${scoped.rows.length}행 · 배치 ${batches.length}개 · 작업자 ${concurrency} · 모델 ${input.model} · 사고 ${input.effort} · 승인된 용어 ${terms.length}개 중 배치마다 나오는 것만 넣음`
  })
  if (skipped > 0) log({ level: 'info', batchId: null, message: `승인된 ${skipped}행은 건너뜁니다.` })
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
        message: `이 범위에 나오는 승인된 용어 ${used.length}개는 ${input.language} 확정 번역이 없어 번역 없이 들어갑니다. 용어집 화면의 [용어 번역]과 [선택 승인]으로 채우면 다음 번역부터 반영됩니다.`,
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
