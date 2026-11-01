import type { AuthStatusJson } from '@shared/schema/agent'

/**
 * Claude Code 가 지금 쓰는 인증 방식.
 * - subscription: Claude 구독 계정(Pro·Max 등). 사용량 한도(/usage)가 있다
 * - api-key: API 키. Console 로그인이 만든 키, 환경 변수 ANTHROPIC_API_KEY, apiKeyHelper 등. API 요금으로 청구된다
 * - provider: Amazon Bedrock·Google Cloud 같은 클라우드 제공자
 * - none: 로그인하지 않음
 */
export type AuthMethodKind = 'subscription' | 'api-key' | 'provider' | 'none'

export type AuthMethodView = { kind: AuthMethodKind; label: string }

/** 알려진 API 키 출처. 모르는 출처는 CLI 가 준 글자를 그대로 보여 준다(종류를 좁히지 않는다). */
const KEY_SOURCE_LABEL: Readonly<Record<string, string>> = {
  '/login managed key': 'Console 로그인',
  ANTHROPIC_API_KEY: '환경 변수 ANTHROPIC_API_KEY',
  apiKeyHelper: 'apiKeyHelper 설정'
}

/**
 * `claude auth status --json` 으로 인증 방식을 가린다. Console(API 과금)으로 로그인해도 authMethod 는 "claude.ai" 로
 * 오므로 authMethod 를 믿지 않고 apiKeySource(API 키를 쓸 때만 있음)와 apiProvider 로 가린다(Claude Code 2.1 실측).
 */
export function describeAuthMethod(
  status: (Pick<AuthStatusJson, 'loggedIn'> & Partial<Pick<AuthStatusJson, 'apiKeySource' | 'apiProvider' | 'subscriptionType'>>) | null
): AuthMethodView {
  if (!status?.loggedIn) return { kind: 'none', label: '로그인하지 않음' }
  const source = status.apiKeySource?.trim()
  if (source) return { kind: 'api-key', label: `API 키 (${KEY_SOURCE_LABEL[source] ?? source})` }
  const provider = status.apiProvider?.trim()
  if (provider && provider !== 'firstParty') return { kind: 'provider', label: `클라우드 제공자 (${provider})` }
  const plan = status.subscriptionType?.trim()
  return { kind: 'subscription', label: plan ? `Claude 구독 (${plan})` : 'Claude 구독' }
}
