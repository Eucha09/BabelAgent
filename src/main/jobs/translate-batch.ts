import { checkRow, type QaContext } from '@core/qa/check'
import type { TranslateBatch } from '@core/translate/batches'
import { describeInjectedTerms, filterTermsForTexts, type GlossaryTerm } from '@core/translate/glossary'
import { buildBatchPrompt, SUBMIT_TOOL } from '@core/translate/prompt'
import { judgeSubmission, SUBMIT_INPUT_SHAPE, toSubmitVerdict } from '@core/translate/submission'
import { createSubmitServer } from '../agent/tools'
import { toQaInput } from '../project/qa'
import { writeBatchTranslations } from '../project/store'
import { logSubmitFailure, runAgentBatch, type AgentJobContext } from './agent-batch'
import type { BatchOutcome } from './scheduler'

export { MAX_TURNS } from './agent-batch'

export type BatchContext = AgentJobContext & {
  language: string
  sourceLanguage: string
  /** 승인된 용어 전체. 배치마다 그 배치 원문에 나오는 용어만 골라 넣는다 */
  glossary: readonly GlossaryTerm[]
  /** 제출된 번역의 행별 QA 에 쓴다 */
  qa: QaContext
  /** 작업을 시작할 때 본 행(키 → 지문). 그 뒤 사용자가 고친 행은 덮지 않는다. */
  baseline: ReadonlyMap<string, string>
}

export async function runTranslateBatch(
  ctx: BatchContext,
  batch: TranslateBatch,
  signal: AbortSignal
): Promise<BatchOutcome> {
  const batchId = batch.id
  const label = `배치 ${batchId}`
  const terms = filterTermsForTexts(ctx.glossary, batch.rows.map((row) => row.source), ctx.sourceLanguage)
  const injected = describeInjectedTerms(terms)
  ctx.log({
    level: 'info',
    batchId,
    message: `${label} 시작 (${batch.rows.length}행) · ${injected.text}`,
    ...(injected.detail ? { detail: injected.detail } : {})
  })

  const expectedKeys = batch.rows.map((row) => row.key)
  const rowsByKey = new Map(batch.rows.map((row) => [row.key, row]))
  const result = await runAgentBatch({
    ctx,
    batchId,
    label,
    tool: SUBMIT_TOOL,
    prompt: buildBatchPrompt(batch.rows, terms),
    signal,
    buildServer: (sdk) =>
      createSubmitServer(
        sdk,
        {
          tool: SUBMIT_TOOL,
          description:
            'Submit the translation of every key in this batch. Call once; if problems are reported, fix them and call once more.',
          shape: SUBMIT_INPUT_SHAPE,
          read: (args) => args.translations,
          judge: (items, final) =>
            toSubmitVerdict(
              judgeSubmission({
                expectedKeys,
                items,
                final,
                mode: 'batch',
                qa: (item) => {
                  const row = rowsByKey.get(item.key)
                  return row ? checkRow(toQaInput(row, { text: item.text, status: 'draft', source_hash: row.source_hash }), ctx.qa) : []
                }
              }),
              items
            )
        },
        (event) => {
          if (!event.ok) {
            logSubmitFailure(ctx.log, batchId, label, SUBMIT_TOOL, event)
            return
          }
          const note = event.remarkCount > 0 ? ` · 남은 길이·용어 오류 ${event.remarkCount}건은 검토 화면에서 확인` : ''
          ctx.log({ level: event.remarkCount > 0 ? 'warn' : 'ok', batchId, message: `${label} · ${SUBMIT_TOOL} → ${event.count}행 통과${note}` })
        }
      )
  })
  if (result.kind === 'outcome') return result.outcome

  // 통과한 제출이 있으면 기록한다. 배치는 온전하므로 그 뒤에 중단 신호가 왔어도 버리지 않는다.
  const write = writeBatchTranslations(ctx.dir, ctx.language, result.items, rowsByKey, ctx.baseline)
  if (!write.ok) {
    ctx.log({ level: 'error', batchId, message: `${label} 기록 실패`, detail: write.error.message })
    return { kind: 'failed', reason: '번역 파일에 기록하지 못했습니다.', detail: write.error.message }
  }
  const skipped = write.value.skippedChanged
  ctx.log(
    skipped.length > 0
      ? {
          level: 'warn',
          batchId,
          message: `${label} 기록 완료 (${write.value.written}행) · 작업 중 사람이 고친 ${skipped.length}행은 덮지 않음`,
          detail: skipped.join(', ')
        }
      : { level: 'ok', batchId, message: `${label} 기록 완료 (${write.value.written}행)` }
  )
  return { kind: 'done', written: write.value.written }
}
