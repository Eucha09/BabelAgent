import type { Messages } from '@shared/i18n'
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

/** 알려진 API 키 출처의 이름. 모르는 출처는 CLI 가 준 글자를 그대로 보여 준다(종류를 좁히지 않는다). */
function keySourceLabel(source: string, t: Messages): string {
  switch (source) {
    case '/login managed key':
      return t.authMethod.keySourceConsole
    case 'ANTHROPIC_API_KEY':
      return t.authMethod.keySourceEnv
    case 'apiKeyHelper':
      return t.authMethod.keySourceHelper
    default:
      return source
  }
}

type AuthStatusInput =
  | (Pick<AuthStatusJson, 'loggedIn'> & Partial<Pick<AuthStatusJson, 'apiKeySource' | 'apiProvider' | 'subscriptionType'>>)
  | null

/**
 * `claude auth status --json` 으로 인증 방식을 가린다. Console(API 과금)으로 로그인해도 authMethod 는 "claude.ai" 로
 * 오므로 authMethod 를 믿지 않고 apiKeySource(API 키를 쓸 때만 있음)와 apiProvider 로 가린다(Claude Code 2.1 실측).
 */
export function authMethodKind(status: AuthStatusInput): AuthMethodKind {
  if (!status?.loggedIn) return 'none'
  if (status.apiKeySource?.trim()) return 'api-key'
  const provider = status.apiProvider?.trim()
  if (provider && provider !== 'firstParty') return 'provider'
  return 'subscription'
}

/** 인증 방식과 화면 언어로 쓴 이름 */
export function describeAuthMethod(status: AuthStatusInput, t: Messages): AuthMethodView {
  const kind = authMethodKind(status)
  switch (kind) {
    case 'none':
      return { kind, label: t.authMethod.none }
    case 'api-key':
      return { kind, label: t.authMethod.apiKey(keySourceLabel(status?.apiKeySource?.trim() ?? '', t)) }
    case 'provider':
      return { kind, label: t.authMethod.provider(status?.apiProvider?.trim() ?? '') }
    case 'subscription': {
      const plan = status?.subscriptionType?.trim()
      return { kind, label: plan ? t.authMethod.subscriptionPlan(plan) : t.authMethod.subscription }
    }
  }
}
