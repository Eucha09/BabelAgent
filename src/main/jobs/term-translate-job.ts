import { randomUUID } from 'node:crypto'
import { termKey } from '@core/glossary/entries'
import { findTermUsages, pickTermExamples } from '@core/terms/addition'
import {
  buildTermTranslateBatches,
  buildTermTranslateBatchPrompt,
  buildTermTranslateSystemPrompt,
  EXAMPLES_PER_TERM,
  findTranslateTargets,
  judgeTermTranslations,
  TERM_TRANSLATE_TOOL,
  TERM_TRANSLATIONS_INPUT_SHAPE,
  TERMS_PER_BATCH,
  type TermTranslateBatch,
  type TermTranslateItem,
  type TermTranslateTarget
} from '@core/terms/translation'
import { clampConcurrency } from '@core/translate/batches'
import type { StartTermTranslateInput } from '@shared/schema/glossary'
import type { JobView } from '@shared/schema/jobs'
import type { OpenProject } from '@shared/schema/project'
import type { TranslationRow } from '@shared/schema/strings'
import { fail, ok, type IpcResult } from '@shared/types'
import { createSubmitServer } from '../agent/tools'
import { fillGlossaryTranslations, GLOSSARY_FILE, loadGlossary, loadMaster, loadTranslations } from '../project/store'
import { logSubmitFailure, runAgentBatch, type AgentJobContext } from './agent-batch'
import { ensureNoRunningJob, launchJob, makeLog, type JobSink } from './runner'
import type { BatchOutcome } from './scheduler'
import { msg } from '../i18n'

type JobBatch = TermTranslateBatch & { size: number }

type TermTranslateJobContext = AgentJobContext & {
  sourceLanguage: string
  targetLanguages: string[]
  written: (file: string) => void
}



function countCells(targets: readonly TermTranslateTarget[]): number {
  return targets.reduce((sum, target) => sum + target.languages.length, 0)
}

/**
 * 배치 하나에 넣을 용어. 용어집을 다시 읽어 그 사이 사람이 채운 언어와 지운 용어는 뺀다.
 * 예문은 원문에서 그 용어가 쓰인 행과 그 행의 기존 번역이다([용어 추가]와 같은 방식, 용어마다 몇 행만).
 */
function prepareBatch(ctx: TermTranslateJobContext, batch: JobBatch): IpcResult<{ targets: TermTranslateTarget[]; items: TermTranslateItem[] }> {
  const glossary = loadGlossary(ctx.dir, ctx.targetLanguages)
  if (!glossary.ok) return glossary
  const byKey = new Map(glossary.value.entries.map((entry) => [termKey(entry.term), entry]))

  const pending: { target: TermTranslateTarget; entry: (typeof glossary.value.entries)[number] }[] = []
  for (const target of batch.targets) {
    const entry = byKey.get(termKey(target.term))
    if (!entry) continue
    const languages = target.languages.filter((language) => (entry.translations[language] ?? '').trim() === '')
    if (languages.length > 0) pending.push({ target: { term: entry.term, languages }, entry })
  }
  if (pending.length === 0) return ok({ targets: [], items: [] })

  const master = loadMaster(ctx.dir)
  if (!master.ok) return master
  const translations = new Map<string, Map<string, TranslationRow>>()
  for (const language of ctx.targetLanguages) {
    const loaded = loadTranslations(ctx.dir, language)
    if (!loaded.ok) return loaded
    translations.set(language, new Map(loaded.value.rows.map((row) => [row.key, row])))
  }

  const items = pending.map(({ target, entry }): TermTranslateItem => {
    const usages = findTermUsages(entry.term, master.value.rows, ctx.sourceLanguage)
    return {
      term: entry.term,
      pos: entry.pos,
      note: entry.note,
      translateTo: target.languages,
      known: Object.fromEntries(Object.entries(entry.translations).filter(([language]) => !target.languages.includes(language))),
      examples: pickTermExamples(usages, translations, EXAMPLES_PER_TERM),
      found: usages.length
    }
  })
  return ok({ targets: pending.map((item) => item.target), items })
}

async function runTermTranslateBatch(ctx: TermTranslateJobContext, batch: JobBatch, signal: AbortSignal): Promise<BatchOutcome> {
  const batchId = batch.id
  const label = msg().jobLog.batch(batchId)

  const prepared = prepareBatch(ctx, batch)
  if (!prepared.ok) {
    ctx.log({ level: 'error', batchId, message: msg().jobLog.glossarySourceUnreadableLog(label), detail: prepared.error.message })
    return { kind: 'failed', reason: msg().jobLog.glossarySourceUnreadable, detail: prepared.error.message }
  }
  const { targets, items } = prepared.value
  if (targets.length === 0) {
    ctx.log({ level: 'info', batchId, message: msg().jobLog.termBatchSkipped(label) })
    return { kind: 'done', written: 0 }
  }
  ctx.log({ level: 'info', batchId, message: msg().jobLog.termBatchStart(label, targets.length, countCells(targets)) })

  const result = await runAgentBatch({
    ctx,
    batchId,
    label,
    tool: TERM_TRANSLATE_TOOL,
    prompt: buildTermTranslateBatchPrompt(items),
    signal,
    buildServer: (sdk) =>
      createSubmitServer(
        sdk,
        {
          tool: TERM_TRANSLATE_TOOL,
          description:
            'Submit the translations of every term in this batch. Call once; if problems are reported, fix them and call once more.',
          shape: TERM_TRANSLATIONS_INPUT_SHAPE,
          read: (args) => args.terms,
          judge: (submitted, final) => judgeTermTranslations({ items: submitted, targets, final })
        },
        (event) => {
          if (!event.ok) {
            logSubmitFailure(ctx.log, batchId, label, TERM_TRANSLATE_TOOL, event)
            return
          }
          ctx.log(
            event.remarkCount > 0
              ? {
                  level: 'warn',
                  batchId,
                  message: msg().jobLog.termsPassedDropped(label, TERM_TRANSLATE_TOOL, event.count, event.remarkCount),
                  ...(event.remarks ? { detail: event.remarks } : {})
                }
              : { level: 'ok', batchId, message: msg().jobLog.termsPassed(label, TERM_TRANSLATE_TOOL, event.count) }
          )
        }
      )
  })
  if (result.kind === 'outcome') return result.outcome

  // 빈 칸만 채운다. 그 사이 사람이 채운 칸은 덮지 않는다
  const write = fillGlossaryTranslations(ctx.dir, result.items, ctx.targetLanguages)
  if (!write.ok) {
    ctx.log({ level: 'error', batchId, message: msg().jobLog.writeFailed(label), detail: write.error.message })
    return { kind: 'failed', reason: msg().jobLog.glossaryWriteFailed, detail: write.error.message }
  }
  const { filled, skipped } = write.value
  if (filled.length > 0) ctx.written(GLOSSARY_FILE)
  const byTerm = new Map(result.items.map((item) => [termKey(item.term), item]))
  const detail = filled
    .map(({ term, languages }) => {
      const item = byTerm.get(termKey(term))
      const texts = languages.map((language) => `${language} ${item?.translations[language] ?? ''}`).join(', ')
      return `${term} → ${texts}${item?.reason ? ` (${item.reason})` : ''}`
    })
    .join('\n')
  ctx.log({
    level: 'ok',
    batchId,
    message: `${msg().jobLog.termsFilled(
      label,
      filled.length,
      filled.reduce((sum, item) => sum + item.languages.length, 0)
    )}${skipped.length > 0 ? msg().jobLog.filledMeanwhile(skipped.length) : ''}`,
    ...(detail ? { detail } : {})
  })
  return { kind: 'done', written: filled.length }
}

/**
 * 용어 번역 작업. 고른 언어의 빈 칸만 채운다 — 이미 있는 번역은 덮지 않는다(덮어쓰기는 [선택 재번역]).
 * 승인된 용어에 채운 언어는 승인 대기(pending_languages)가 되어, 사람이 승인하기 전까지 번역 프롬프트와 QA 에 쓰이지 않는다.
 */
export function startTermTranslateJob(
  project: OpenProject,
  input: StartTermTranslateInput,
  auth: { cliPath: string | null; configDir: string | null },
  sink: JobSink
): IpcResult<JobView> {
  const idle = ensureNoRunningJob()
  if (!idle.ok) return idle
  const { dir, config } = project

  const languages = config.targetLanguages.filter((language) => input.languages.includes(language))
  if (languages.length === 0) return fail('invalid-input', msg().jobLog.pickLanguages)
  if (input.scope === 'selected' && input.terms.length === 0) return fail('invalid-input', msg().jobLog.noTermsSelected)

  const glossary = loadGlossary(dir, config.targetLanguages)
  if (!glossary.ok) return glossary
  const only = input.scope === 'selected' ? new Set(input.terms.map(termKey)) : undefined
  const targets = findTranslateTargets(glossary.value.entries, languages, only)
  if (targets.length === 0) return fail('invalid-input', msg().jobLog.noEmptyCells)

  const batches: JobBatch[] = buildTermTranslateBatches(targets, TERMS_PER_BATCH).map((batch) => ({ ...batch, size: batch.targets.length }))
  const concurrency = clampConcurrency(config.batch.concurrency)
  const { model, effort } = config.translate
  const summary = `${languages.join(', ')} · ${input.scope === 'all' ? msg().termTranslate.scopeAll : msg().termTranslate.scopeSelected}`
  const view: Omit<JobView, 'snapshot'> = {
    id: randomUUID(),
    kind: 'term-translate',
    language: languages.length === 1 ? (languages[0] ?? null) : null,
    summary,
    model,
    effort,
    startedAt: new Date().toISOString(),
    notes: []
  }

  const log = makeLog(sink)
  const context: TermTranslateJobContext = {
    dir,
    model,
    effort,
    cliPath: auth.cliPath,
    configDir: auth.configDir,
    systemPrompt: buildTermTranslateSystemPrompt(config),
    sourceLanguage: config.sourceLanguage,
    targetLanguages: config.targetLanguages,
    written: sink.written,
    log
  }
  log({
    level: 'info',
    batchId: null,
    message: msg().jobLog.termTranslateStart(summary, targets.length, countCells(targets), batches.length, concurrency, model, effort)
  })

  return ok(
    launchJob({ view, batches, run: (batch, signal) => runTermTranslateBatch(context, batch, signal), concurrency, sink })
  )
}
