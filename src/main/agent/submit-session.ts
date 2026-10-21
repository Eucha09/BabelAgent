import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { isLimitText, normalizeResetsAt } from '../jobs/limit'
import type { loadAgentSdk } from './sdk'
import { classifyAgentError } from './session'

type Sdk = Awaited<ReturnType<typeof loadAgentSdk>>

export type SubmitSessionResult = {
  /** 사용량 한도에 걸렸으면 재설정 시각(epoch ms, 모르면 null) */
  limit: { resetsAt: number | null } | null
  agentError: string | null
}

/**
 * 제출 도구로 결과를 받는 일회성 세션(배치 번역·행 재번역)을 끝까지 돌린다.
 * 결과는 도구가 보관하므로 여기서는 한도와 오류만 가려낸다.
 * 한도 감지 순서: rate_limit_event(rejected) → assistant.error → 결과 errors · 예외 문장.
 */
export async function runSubmitSession(
  sdk: Sdk,
  options: Options,
  prompt: string,
  signal: AbortSignal
): Promise<SubmitSessionResult> {
  // 바깥에서 중단해도 세션이 따라 멈추게 한다
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  if (signal.aborted) controller.abort()
  else signal.addEventListener('abort', abort)

  let limit: SubmitSessionResult['limit'] = null
  let agentError: string | null = null
  const query = sdk.query({ prompt, options: { ...options, abortController: controller } })
  try {
    for await (const message of query) {
      if (message.type === 'rate_limit_event') {
        if (message.rate_limit_info.status === 'rejected') {
          limit = { resetsAt: normalizeResetsAt(message.rate_limit_info.resetsAt) }
          break
        }
        continue
      }
      if (message.type === 'assistant' && message.error) {
        if (message.error === 'rate_limit') {
          limit = { resetsAt: null }
          break
        }
        agentError = message.error
        continue
      }
      if (message.type === 'result') {
        if (message.subtype !== 'success') {
          const text = message.errors.join(' ')
          if (isLimitText(text)) limit = { resetsAt: null }
          else agentError = agentError ?? `${message.subtype}${text ? `: ${text}` : ''}`
        }
        break
      }
    }
  } catch (error) {
    if (!signal.aborted) {
      const text = error instanceof Error ? error.message : String(error)
      if (isLimitText(text)) limit = { resetsAt: null }
      else agentError = classifyAgentError(error).message
    }
  } finally {
    signal.removeEventListener('abort', abort)
    try {
      query.close()
    } catch {
      // 이미 끝난 세션
    }
  }
  return { limit, agentError }
}
