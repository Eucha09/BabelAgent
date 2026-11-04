import { randomUUID } from 'node:crypto'
import { buildContextBatchPrompt, buildContextSystemPrompt, CONTEXT_TOOL } from '@core/context/prompt'
import { CONTEXT_INPUT_SHAPE, judgeContext, toSuggestion, type SuggestionRules } from '@core/context/submission'
import { knownUiTypes, selectContextTargets, type ContextTarget } from '@core/context/targets'
import { buildBatches, clampConcurrency } from '@core/translate/batches'
import type { StartContextInput } from '@shared/schema/context'
import type { JobView } from '@shared/schema/jobs'
import type { OpenProject } from '@shared/schema/project'
import { fail, ok, type IpcResult } from '@shared/types'
import { createSubmitServer } from '../agent/tools'
import { CONTEXT_SUGGESTIONS_FILE, loadContextSuggestions, loadMaster, writeContextSuggestions } from '../project/store'
import { logSubmitFailure, runAgentBatch, type AgentJobContext } from './agent-batch'
import { ensureNoRunningJob, launchJob, makeLog, type JobSink } from './runner'
import type { BatchOutcome } from './scheduler'
import { msg } from '../i18n'

type ContextBatch = { id: number; size: number; targets: ContextTarget[] }

type ContextJobContext = AgentJobContext & {
  uiTypes: string[]
  caseSensitive: boolean
  /** 제안 행을 만들 때 쓰는 설정(max_len 하한 등) */
  rules: SuggestionRules
  written: (file: string) => void
}


async function runContextBatch(ctx: ContextJobContext, batch: ContextBatch, signal: AbortSignal): Promise<BatchOutcome> {
  const batchId = batch.id
  const label = msg().jobLog.batch(batchId)
  ctx.log({ level: 'info', batchId, message: msg().jobLog.batchStart(label, batch.targets.length) })

  const byKey = new Map(batch.targets.map((target) => [target.row.key, target]))
  const result = await runAgentBatch({
    ctx,
    batchId,
    label,
    tool: CONTEXT_TOOL,
    prompt: buildContextBatchPrompt(batch.targets, ctx.uiTypes),
    signal,
    buildServer: (sdk) =>
      createSubmitServer(
        sdk,
        {
          tool: CONTEXT_TOOL,
          description:
            'Submit the requested metadata for every key in this batch. Call once; if problems are reported, fix them and call once more.',
          shape: CONTEXT_INPUT_SHAPE,
          read: (args) => args.entries,
          judge: (entries, final) => judgeContext({ targets: batch.targets, entries, final, caseSensitive: ctx.caseSensitive })
        },
        (event) => {
          if (!event.ok) {
            logSubmitFailure(ctx.log, batchId, label, CONTEXT_TOOL, event)
            return
          }
          ctx.log(
            event.remarkCount > 0
              ? {
                  level: 'warn',
                  batchId,
                  message: msg().jobLog.passedRowsDropped(label, CONTEXT_TOOL, event.count, event.remarkCount),
                  ...(event.remarks ? { detail: event.remarks } : {})
                }
              : { level: 'ok', batchId, message: msg().jobLog.passedRows(label, CONTEXT_TOOL, event.count) }
          )
        }
      )
  })
  if (result.kind === 'outcome') return result.outcome

  const suggestions = result.items.flatMap((entry) => {
    const target = byKey.get(entry.key)
    const suggestion = target ? toSuggestion(entry, target, ctx.rules) : null
    return suggestion ? [suggestion] : []
  })
  if (suggestions.length > 0) {
    const write = writeContextSuggestions(ctx.dir, suggestions)
    if (!write.ok) {
      ctx.log({ level: 'error', batchId, message: msg().jobLog.writeFailed(label), detail: write.error.message })
      return { kind: 'failed', reason: msg().jobLog.suggestionsWriteFailed, detail: write.error.message }
    }
    ctx.written(CONTEXT_SUGGESTIONS_FILE)
  }
  const empty = result.items.length - suggestions.length
  ctx.log({
    level: 'ok',
    batchId,
    message: `${msg().jobLog.suggestionsWritten(label, suggestions.length)}${empty > 0 ? msg().jobLog.suggestionsEmpty(empty) : ''}`
  })
  return { kind: 'done', written: suggestions.length }
}

/**
 * 원문 메타데이터(context·ui_type·max_len·vars) 추정 작업. 결과는 원문에 바로 쓰지 않고
 * context_suggestions.csv 에 제안으로 쌓는다 — 사람이 컨텍스트 화면에서 고치고 승인해야 원문에 들어간다.
 */
export function startContextJob(
  project: OpenProject,
  input: StartContextInput,
  auth: { cliPath: string | null; configDir: string | null },
  sink: JobSink
): IpcResult<JobView> {
  const idle = ensureNoRunningJob()
  if (!idle.ok) return idle
  const { dir, config } = project

  const master = loadMaster(dir)
  if (!master.ok) return master
  if (master.value.rows.length === 0) return fail('invalid-input', msg().jobLog.noSource)
  if (input.scope === 'selected' && input.keys.length === 0) return fail('invalid-input', msg().jobLog.noRowsSelected)

  const pending = loadContextSuggestions(dir)
  if (!pending.ok) return pending
  const { targets, skippedPending } = selectContextTargets(
    master.value.rows,
    { fields: input.fields, scope: input.scope, selected: new Set(input.keys) },
    new Set(pending.value.rows.map((row) => row.key)),
    config.smartStrings
  )
  if (targets.length === 0) {
    return fail(
      'invalid-input',
      skippedPending.length > 0
        ? msg().jobLog.nothingButPending(skippedPending.length)
        : msg().jobLog.nothingToInfer
    )
  }

  const byKey = new Map(targets.map((target) => [target.row.key, target]))
  const batches: ContextBatch[] = buildBatches(
    targets.map((target) => target.row),
    config.batch
  ).map((batch) => {
    const items = batch.rows.flatMap((row) => {
      const target = byKey.get(row.key)
      return target ? [target] : []
    })
    return { id: batch.id, size: items.length, targets: items }
  })
  const concurrency = clampConcurrency(config.batch.concurrency)
  const { model, effort } = config.translate
  const fields = input.fields.map((field) => msg().contextScreen.field[field]).join('·')
  const view: Omit<JobView, 'snapshot'> = {
    id: randomUUID(),
    kind: 'context',
    language: null,
    summary: `${fields} · ${input.scope === 'selected' ? msg().contextScreen.scopeSelected : msg().contextScreen.scopeEmpty}`,
    model,
    effort,
    startedAt: new Date().toISOString(),
    notes: skippedPending.length > 0 ? [msg().jobLog.pendingSkippedNote(skippedPending.length)] : []
  }

  const log = makeLog(sink)
  const context: ContextJobContext = {
    dir,
    model,
    effort,
    cliPath: auth.cliPath,
    configDir: auth.configDir,
    systemPrompt: buildContextSystemPrompt(config),
    uiTypes: knownUiTypes(master.value.rows),
    caseSensitive: config.smartStrings.caseSensitive,
    rules: { smart: config.smartStrings, maxLenRatio: config.context.maxLenRatio },
    written: sink.written,
    log
  }
  log({
    level: 'info',
    batchId: null,
    message: msg().jobLog.contextStart(fields, targets.length, batches.length, concurrency, model, effort)
  })
  if (skippedPending.length > 0) {
    log({ level: 'info', batchId: null, message: msg().jobLog.pendingSkipped(skippedPending.length) })
  }

  return ok(launchJob({ view, batches, run: (batch, signal) => runContextBatch(context, batch, signal), concurrency, sink }))
}
