import type * as AgentSdk from '@anthropic-ai/claude-agent-sdk'

/**
 * Agent SDK는 ESM 전용 패키지다. 메인 프로세스 번들은 CJS이므로
 * (sandbox: true 프리로드가 CJS를 요구한다) 동적 import로 가져온다.
 * 번들러가 require로 바꾸지 못하게 간접 호출을 쓴다.
 */
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<typeof AgentSdk>

let cached: Promise<typeof AgentSdk> | null = null

export function loadAgentSdk(): Promise<typeof AgentSdk> {
  cached ??= dynamicImport('@anthropic-ai/claude-agent-sdk')
  return cached
}
