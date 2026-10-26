import type { Options } from '@anthropic-ai/claude-agent-sdk'
import type { TranslateEffort, TranslateModel } from '@shared/schema/jobs'
import { loadAgentSdk } from '../agent/sdk'
import { agentQueryOptions } from '../agent/session'
import { runSubmitSession } from '../agent/submit-session'
import { mcpToolName, type SubmitServer } from '../agent/tools'
import type { JobLog } from './runner'
import type { BatchOutcome } from './scheduler'

type Sdk = Awaited<ReturnType<typeof loadAgentSdk>>

/** 배치 세션 공통 설정. 작업마다 한 번 만든다. */
export type AgentJobContext = {
  dir: string
  model: TranslateModel
  effort: TranslateEffort
  cliPath: string | null
  configDir: string | null
  /** 작업마다 한 번 만든다. 배치마다 같은 문자열이어야 프롬프트 캐싱이 걸린다. */
  systemPrompt: string
  log: JobLog
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

export type AgentBatchResult<T> =
  /** 통과한 제출. 기록은 호출한 쪽이 한다 */
  | { kind: 'accepted'; items: T[] }
  /** 기록할 것이 없다. 스케줄러에 그대로 돌려준다 */
  | { kind: 'outcome'; outcome: BatchOutcome }

/**
 * 제출 도구 하나만 붙인 일회성 세션으로 배치 하나를 돌린다(번역·컨텍스트 추정·용어 추출 공통).
 * 통과한 제출이 있으면 그 뒤에 중단 신호가 왔어도 돌려준다 — 배치는 온전하므로 버리지 않는다.
 * 실패·한도·중단은 여기서 로그를 남기고 스케줄러 결과로 바꾼다.
 */
export async function runAgentBatch<T>(input: {
  ctx: AgentJobContext
  batchId: number
  /** 로그 머리. 예: "배치 3" */
  label: string
  tool: string
  buildServer: (sdk: Sdk) => SubmitServer<T>
  prompt: string
  signal: AbortSignal
}): Promise<AgentBatchResult<T>> {
  const { ctx, batchId, label, signal } = input

  const fake = fakeLimit(signal)
  if (fake) {
    const outcome = await fake
    if (outcome.kind === 'limit') ctx.log({ level: 'warn', batchId, message: `${label} 사용량 한도 (가짜, BABEL_FAKE_LIMIT)` })
    return { kind: 'outcome', outcome }
  }

  let sdk: Sdk
  try {
    sdk = await loadAgentSdk()
  } catch (error) {
    return { kind: 'outcome', outcome: { kind: 'failed', reason: 'Agent SDK를 불러오지 못했습니다.', detail: String(error) } }
  }

  const submit = input.buildServer(sdk)
  const options: Options = {
    ...agentQueryOptions(ctx.dir, ctx.cliPath, ctx.configDir),
    includePartialMessages: false,
    systemPrompt: ctx.systemPrompt,
    mcpServers: { babel: submit.server },
    allowedTools: [mcpToolName(input.tool)],
    maxTurns: MAX_TURNS,
    effort: ctx.effort
  }
  if (ctx.model !== 'default') options.model = ctx.model

  const { limit, agentError } = await runSubmitSession(sdk, options, input.prompt, signal)

  const accepted = submit.accepted()
  if (accepted) return { kind: 'accepted', items: accepted }

  if (limit) {
    ctx.log({ level: 'warn', batchId, message: `${label} 사용량 한도 — 모든 작업자를 멈춥니다` })
    return { kind: 'outcome', outcome: { kind: 'limit', resetsAt: limit.resetsAt } }
  }
  if (signal.aborted) {
    ctx.log({ level: 'info', batchId, message: `${label} 중단 — 기록하지 않았습니다` })
    return { kind: 'outcome', outcome: { kind: 'aborted' } }
  }

  const problems = submit.lastProblems()
  const reason = problems
    ? '제출이 검증을 통과하지 못했습니다.'
    : agentError
      ? '에이전트 실행 중 오류가 났습니다.'
      : '에이전트가 결과를 제출하지 않았습니다.'
  const detail = problems ?? agentError ?? undefined
  ctx.log(
    detail === undefined
      ? { level: 'error', batchId, message: `${label} 실패: ${reason}` }
      : { level: 'error', batchId, message: `${label} 실패: ${reason}`, detail }
  )
  return { kind: 'outcome', outcome: detail === undefined ? { kind: 'failed', reason } : { kind: 'failed', reason, detail } }
}

/** 제출 이벤트를 작업 로그 한 줄로. ok 일 때 문구는 작업마다 다르다. */
export function logSubmitFailure(
  log: JobLog,
  batchId: number,
  label: string,
  tool: string,
  event: { attempt: number; problems: string; final: boolean }
): void {
  log({
    level: 'warn',
    batchId,
    message: `${label} · ${tool} → 검증 실패 (${event.attempt}번째${event.final ? ', 더 받지 않음' : ', 수정 대기'})`,
    detail: event.problems
  })
}
