import { randomUUID } from 'node:crypto'
import { termKey } from '@core/glossary/entries'
import { findTermsInSource } from '@core/qa/glossary'
import { buildTermsBatchPrompt, buildTermsSystemPrompt, TERMS_TOOL } from '@core/terms/prompt'
import { judgeTerms, TERMS_EXTRACT_SHAPE } from '@core/terms/submission'
import { buildBatches, clampConcurrency, type TranslateBatch } from '@core/translate/batches'
import type { StartTermsInput } from '@shared/schema/glossary'
import type { JobView } from '@shared/schema/jobs'
import type { OpenProject } from '@shared/schema/project'
import { fail, ok, type IpcResult } from '@shared/types'
import { createSubmitServer } from '../agent/tools'
import { appendGlossaryCandidates, GLOSSARY_FILE, loadAllGlossaryTerms, loadMaster } from '../project/store'
import { logSubmitFailure, runAgentBatch, type AgentJobContext } from './agent-batch'
import { ensureNoRunningJob, launchJob, makeLog, type JobSink } from './runner'
import type { BatchOutcome } from './scheduler'

type TermsBatch = TranslateBatch & { size: number }

type TermsJobContext = AgentJobContext & {
  sourceLanguage: string
  targetLanguages: string[]
  written: (file: string) => void
}

async function runTermsBatch(ctx: TermsJobContext, batch: TermsBatch, signal: AbortSignal): Promise<BatchOutcome> {
  const batchId = batch.id
  const label = `배치 ${batchId}`
  const sources = batch.rows.map((row) => row.source)

  // 배치마다 다시 읽는다 — 앞 배치가 붙인 후보와 그 사이 사람이 더한 용어를 다시 내지 않게
  const all = loadAllGlossaryTerms(ctx.dir)
  if (!all.ok) {
    ctx.log({ level: 'error', batchId, message: `${label} 용어집을 읽지 못했습니다`, detail: all.error.message })
    return { kind: 'failed', reason: '용어집을 읽지 못했습니다.', detail: all.error.message }
  }
  const terms = all.value.map((term) => ({ term }))
  const known = new Set<string>()
  for (const text of sources) {
    for (const found of findTermsInSource(text, terms, ctx.sourceLanguage)) known.add(found.term)
  }
  ctx.log({ level: 'info', batchId, message: `${label} 시작 (${batch.rows.length}행) · 이미 있는 용어 ${known.size}개` })

  const result = await runAgentBatch({
    ctx,
    batchId,
    label,
    tool: TERMS_TOOL,
    prompt: buildTermsBatchPrompt(batch.rows, [...known]),
    signal,
    buildServer: (sdk) =>
      createSubmitServer(
        sdk,
        {
          tool: TERMS_TOOL,
          description:
            'Submit the new glossary candidates found in this batch (an empty list if none). Call once; if problems are reported, fix them and call once more.',
          shape: TERMS_EXTRACT_SHAPE,
          read: (args) => args.terms,
          judge: (items, final) =>
            judgeTerms({
              items,
              final,
              targetLanguages: ctx.targetLanguages,
              existing: new Set(all.value.map(termKey)),
              sources: { texts: sources, language: ctx.sourceLanguage }
            })
        },
        (event) => {
          if (!event.ok) {
            logSubmitFailure(ctx.log, batchId, label, TERMS_TOOL, event)
            return
          }
          ctx.log(
            event.remarkCount > 0
              ? {
                  level: 'warn',
                  batchId,
                  message: `${label} · ${TERMS_TOOL} → 후보 ${event.count}개 통과 · 문제가 남은 ${event.remarkCount}건은 버림`,
                  ...(event.remarks ? { detail: event.remarks } : {})
                }
              : { level: 'ok', batchId, message: `${label} · ${TERMS_TOOL} → 후보 ${event.count}개 통과` }
          )
        }
      )
  })
  if (result.kind === 'outcome') return result.outcome

  // 병렬 배치가 같은 용어를 냈을 수 있다. 기록할 때 다시 읽어 먼저 기록된 쪽만 남긴다.
  const write = appendGlossaryCandidates(ctx.dir, result.items, ctx.targetLanguages)
  if (!write.ok) {
    ctx.log({ level: 'error', batchId, message: `${label} 기록 실패`, detail: write.error.message })
    return { kind: 'failed', reason: '용어집에 기록하지 못했습니다.', detail: write.error.message }
  }
  const { added, existing } = write.value
  if (added.length > 0) ctx.written(GLOSSARY_FILE)
  ctx.log({
    level: 'ok',
    batchId,
    message: `${label} 후보 ${added.length}개 추가(승인 대기)${existing.length > 0 ? ` · 다른 배치와 겹친 ${existing.length}개는 뺌` : ''}`,
    ...(added.length > 0 ? { detail: added.join(', ') } : {})
  })
  return { kind: 'done', written: added.length }
}

/**
 * 용어 후보 추출 작업. 후보만 찾는다 — 번역은 용어 번역 작업(term-translate-job.ts)이 빈 칸을 채운다.
 * 후보는 glossary.csv 에 status: pending 으로 들어가고, 사람이 용어집 화면에서 승인해야 번역 프롬프트와 QA 에 쓰인다.
 */
export function startTermsJob(
  project: OpenProject,
  input: StartTermsInput,
  auth: { cliPath: string | null; configDir: string | null },
  sink: JobSink
): IpcResult<JobView> {
  const idle = ensureNoRunningJob()
  if (!idle.ok) return idle
  const { dir, config } = project

  const master = loadMaster(dir)
  if (!master.ok) return master
  if (input.scope === 'selected' && input.keys.length === 0) return fail('invalid-input', '선택한 행이 없습니다.')
  const selected = new Set(input.keys)
  const rows = master.value.rows.filter(
    (row) => row.source.trim() !== '' && (input.scope === 'all' || selected.has(row.key))
  )
  if (rows.length === 0) return fail('invalid-input', '용어를 찾을 원문이 없습니다.')

  const batches: TermsBatch[] = buildBatches(rows, config.batch).map((batch) => ({ ...batch, size: batch.rows.length }))
  const concurrency = clampConcurrency(config.batch.concurrency)
  const { model, effort } = config.translate
  const view: Omit<JobView, 'snapshot'> = {
    id: randomUUID(),
    kind: 'terms',
    language: null,
    summary: input.scope === 'selected' ? '선택 행' : '전체 원문',
    model,
    effort,
    startedAt: new Date().toISOString(),
    notes: []
  }

  const log = makeLog(sink)
  const context: TermsJobContext = {
    dir,
    model,
    effort,
    cliPath: auth.cliPath,
    configDir: auth.configDir,
    systemPrompt: buildTermsSystemPrompt(config),
    sourceLanguage: config.sourceLanguage,
    targetLanguages: config.targetLanguages,
    written: sink.written,
    log
  }
  log({
    level: 'info',
    batchId: null,
    message: `용어 추출 시작: ${view.summary} · ${rows.length}행 · 배치 ${batches.length}개 · 작업자 ${concurrency} · 모델 ${model} · 사고 ${effort}`
  })

  return ok(launchJob({ view, batches, run: (batch, signal) => runTermsBatch(context, batch, signal), concurrency, sink }))
}
