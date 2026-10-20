import { z } from 'zod'
import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { UsageLimitRow, type UsageLimits } from '@shared/schema/usage'
import { fail, ok, type IpcResult } from '@shared/types'
import { agentQueryOptions } from './session'
import { loadAgentSdk } from './sdk'

const TIMEOUT_MS = 30_000

/**
 * 구독 사용량 한도를 읽는다.
 * `/usage`는 로컬 슬래시 명령이라 모델을 호출하지 않고, 응답에 서버의 사용량 행이 실려 온다.
 */
export async function readUsageLimits(
  cwd: string,
  cliPath: string | null,
  configDir: string | null
): Promise<IpcResult<UsageLimits>> {
  let sdk: Awaited<ReturnType<typeof loadAgentSdk>>
  try {
    sdk = await loadAgentSdk()
  } catch (error) {
    return fail(
      'unknown',
      'Agent SDK를 불러오지 못했습니다.',
      error instanceof Error ? error.message : String(error)
    )
  }

  const controller = new AbortController()
  const options: Options = {
    ...agentQueryOptions(cwd, cliPath, configDir),
    includePartialMessages: false,
    abortController: controller
  }

  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const query = sdk.query({ prompt: '/usage', options })

  try {
    for await (const message of query) {
      if (message.type === 'assistant') {
        const rows = message.usage_report?.rate_limits?.limits
        if (!rows) continue
        const parsed = z.array(UsageLimitRow).safeParse(rows)
        if (!parsed.success) {
          return fail('unknown', '사용량 정보 형식이 예상과 다릅니다.', parsed.error.message)
        }
        return ok({ limits: parsed.data, fetchedAt: new Date().toISOString() })
      }
      if (message.type === 'result') break
    }
    return fail(
      'unknown',
      '사용량 정보를 받지 못했습니다. 구독 계정이 아니거나 서버가 값을 주지 않았습니다.'
    )
  } catch (error) {
    return fail(
      'unknown',
      '사용량 조회에 실패했습니다.',
      error instanceof Error ? error.message : String(error)
    )
  } finally {
    clearTimeout(timer)
    try {
      query.close()
    } catch {
      // 이미 끝난 세션
    }
  }
}
