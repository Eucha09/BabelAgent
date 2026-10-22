import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { checkRow, type QaContext } from '@core/qa/check'
import type { TranslateBatch } from '@core/translate/batches'
import { filterTermsForTexts, type GlossaryTerm } from '@core/translate/glossary'
import { buildBatchPrompt, SUBMIT_TOOL } from '@core/translate/prompt'
import { judgeSubmission } from '@core/translate/submission'
import type { JobLogEntry, TranslateEffort, TranslateModel } from '@shared/schema/jobs'
import { loadAgentSdk } from '../agent/sdk'
import { agentQueryOptions } from '../agent/session'
import { runSubmitSession } from '../agent/submit-session'
import { createSubmitServer, mcpToolName } from '../agent/tools'
import { toQaInput } from '../project/qa'
import { writeBatchTranslations } from '../project/store'
import type { BatchOutcome } from './scheduler'

export type BatchContext = {
  dir: string
  language: string
  model: TranslateModel
  effort: TranslateEffort
  cliPath: string | null
  configDir: string | null
  /** 작업마다 한 번 만든다. 배치마다 같은 문자열이어야 프롬프트 캐싱이 걸린다. */
  systemPrompt: string
  glossary: readonly GlossaryTerm[]
  /** 제출된 번역의 행별 QA 에 쓴다 */
  qa: QaContext
  /** 작업을 시작할 때 본 행(키 → 지문). 그 뒤 사용자가 고친 행은 덮지 않는다. */
  baseline: ReadonlyMap<string, string>
  log: (entry: Omit<JobLogEntry, 'at'>) => void
}

/** 배치 하나가 넘지 않을 대화 왕복. 제출 + 수정 한 번 + 여유. */
export const MAX_TURNS = 6

/** 화면에서 한도 대기를 확인하려고 쓰는 가짜 한도. BABEL_FAKE_LIMIT=1 일 때 앱 실행당 한 번만. */
const FAKE_LIMIT_WAIT_MS = 20_000
let fakeLimitUsed = false

function fakeLimit(signal: AbortSignal): Promise<BatchOutcome> | null {
  if (process.env['BABEL_FAKE_LIMIT'] !== '1' || fakeLimitUsed) return null
  fakeLimitUsed = true
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ kind: 'limit', resetsAt: Date.now() + FAKE_LIMIT_WAIT_MS }), 1500)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve({ kind: 'aborted' })
    })
  })
}

export async function runTranslateBatch(
  ctx: BatchContext,
  batch: TranslateBatch,
  signal: AbortSignal
): Promise<BatchOutcome> {
  const batchId = batch.id
  ctx.log({ level: 'info', batchId, message: `배치 ${batchId} 시작 (${batch.rows.length}행)` })

  const fake = fakeLimit(signal)
  if (fake) {
    const outcome = await fake
    if (outcome.kind === 'limit') ctx.log({ level: 'warn', batchId, message: `배치 ${batchId} 사용량 한도 (가짜, BABEL_FAKE_LIMIT)` })
    return outcome
  }

  let sdk: Awaited<ReturnType<typeof loadAgentSdk>>
  try {
    sdk = await loadAgentSdk()
  } catch (error) {
    return { kind: 'failed', reason: 'Agent SDK를 불러오지 못했습니다.', detail: String(error) }
  }

  const expectedKeys = batch.rows.map((row) => row.key)
  const rowsByKey = new Map(batch.rows.map((row) => [row.key, row]))
  const submit = createSubmitServer(
    sdk,
    (items, final) =>
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
    (event) => {
      if (event.ok) {
        const note = event.unresolved > 0 ? ` · 남은 길이·용어 오류 ${event.unresolved}건은 검토 화면에서 확인` : ''
        ctx.log({ level: event.unresolved > 0 ? 'warn' : 'ok', batchId, message: `배치 ${batchId} · ${SUBMIT_TOOL} → ${event.count}행 통과${note}` })
      } else {
        ctx.log({
          level: 'warn',
          batchId,
          message: `배치 ${batchId} · ${SUBMIT_TOOL} → 검증 실패 (${event.attempt}번째${event.final ? ', 더 받지 않음' : ', 수정 대기'})`,
          detail: event.problems
        })
      }
    }
  )

  const options: Options = {
    ...agentQueryOptions(ctx.dir, ctx.cliPath, ctx.configDir),
    includePartialMessages: false,
    systemPrompt: ctx.systemPrompt,
    mcpServers: { babel: submit.server },
    allowedTools: [mcpToolName(SUBMIT_TOOL)],
    maxTurns: MAX_TURNS,
    effort: ctx.effort
  }
  if (ctx.model !== 'default') options.model = ctx.model

  const terms = filterTermsForTexts(ctx.glossary, batch.rows.map((row) => row.source))
  const { limit, agentError } = await runSubmitSession(sdk, options, buildBatchPrompt(batch.rows, terms), signal)

  // 통과한 제출이 있으면 기록한다. 배치는 온전하므로 그 뒤에 중단 신호가 왔어도 버리지 않는다.
  const accepted = submit.accepted()
  if (accepted) {
    const write = writeBatchTranslations(ctx.dir, ctx.language, accepted, rowsByKey, ctx.baseline)
    if (!write.ok) {
      ctx.log({ level: 'error', batchId, message: `배치 ${batchId} 기록 실패`, detail: write.error.message })
      return { kind: 'failed', reason: '번역 파일에 기록하지 못했습니다.', detail: write.error.message }
    }
    const skipped = write.value.skippedChanged
    ctx.log(
      skipped.length > 0
        ? {
            level: 'warn',
            batchId,
            message: `배치 ${batchId} 기록 완료 (${write.value.written}행) · 작업 중 사람이 고친 ${skipped.length}행은 덮지 않음`,
            detail: skipped.join(', ')
          }
        : { level: 'ok', batchId, message: `배치 ${batchId} 기록 완료 (${write.value.written}행)` }
    )
    return { kind: 'done', written: write.value.written }
  }

  if (limit) {
    ctx.log({ level: 'warn', batchId, message: `배치 ${batchId} 사용량 한도 — 모든 작업자를 멈춥니다` })
    return { kind: 'limit', resetsAt: limit.resetsAt }
  }
  if (signal.aborted) {
    ctx.log({ level: 'info', batchId, message: `배치 ${batchId} 중단 — 기록하지 않았습니다` })
    return { kind: 'aborted' }
  }

  const problems = submit.lastProblems()
  const reason = problems
    ? '제출이 검증을 통과하지 못했습니다.'
    : agentError
      ? '에이전트 실행 중 오류가 났습니다.'
      : '에이전트가 번역을 제출하지 않았습니다.'
  const detail = problems ?? agentError ?? undefined
  ctx.log(detail === undefined ? { level: 'error', batchId, message: `배치 ${batchId} 실패: ${reason}` } : { level: 'error', batchId, message: `배치 ${batchId} 실패: ${reason}`, detail })
  return detail === undefined ? { kind: 'failed', reason } : { kind: 'failed', reason, detail }
}
