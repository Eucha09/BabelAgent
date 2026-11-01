import { z } from 'zod'
import type { StyleRuleChange } from './project'

/**
 * 에이전트 오류 분류. 사용자가 원인을 알 수 있어야 하므로 종류를 좁게 나눈다.
 * - cli-not-found: Claude Code CLI를 찾지 못함 (설정에서 경로 지정 필요)
 * - auth-failed: CLI는 있으나 로그인/권한 문제
 * - sdk-load-failed: Agent SDK 모듈 로드 실패
 * - aborted: 사용자가 취소
 */
export const AgentErrorKind = z.enum([
  'cli-not-found',
  'auth-failed',
  'sdk-load-failed',
  'aborted',
  'unknown'
])
export type AgentErrorKind = z.infer<typeof AgentErrorKind>

export type AgentError = {
  kind: AgentErrorKind
  /** 사용자에게 보여줄 한국어 메시지. */
  message: string
  /** stderr 꼬리 등 진단 정보. 접어서 보여준다. */
  detail?: string
}

export type AgentAccount = {
  email?: string
  organization?: string
  subscriptionType?: string
  apiProvider?: string
  /** SDK가 실제로 실행한 CLI 경로(설정값 또는 기본 탐색 결과). */
  cliPath: string | null
  /** CLI가 로그인 정보를 읽은 설정 폴더. 인증 문제 진단의 출발점이다. */
  configDir: string
}

export type AgentCheckResult = { ok: true; account: AgentAccount } | { ok: false; error: AgentError }

export const AgentChatSendInput = z.object({
  requestId: z.string().min(1),
  text: z.string().min(1),
  /** 열린 프로젝트 폴더. 없으면 세션을 만들지 않는다. */
  projectDir: z.string().min(1),
  /** 이어갈 세션 ID. 패널 채팅만 세션을 유지한다. */
  sessionId: z.string().min(1).nullable()
})
export type AgentChatSendInput = z.infer<typeof AgentChatSendInput>

export const AgentChatCancelInput = z.object({ requestId: z.string().min(1) })
export type AgentChatCancelInput = z.infer<typeof AgentChatCancelInput>

/**
 * 패널 에이전트가 낸 스타일 규칙 제안. 도구는 저장하지 않고 이 카드를 띄운다 —
 * 사용자가 [저장]을 눌러야 project.json 에 들어간다(사용자 결정, 2026-10-22).
 */
export type ChatRuleProposal = {
  requestId: string
  proposalId: string
  change: StyleRuleChange
  /** 수정·삭제할 규칙의 지금 글. 추가면 null */
  currentText: string | null
}

export type AgentChatDelta = { requestId: string; text: string }
export type AgentChatEnd = { requestId: string; sessionId: string | null; durationMs: number }
export type AgentChatError = { requestId: string } & AgentError

/**
 * CLI 는 값이 없는 필드를 빼기도 하고 null 로 주기도 한다(Console 로그인의 subscriptionType 은 null).
 * 둘 다 "없음"으로 받는다.
 */
const OptionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

/** `claude auth status --json` 출력. CLI가 필드를 늘려도 깨지지 않게 느슨하게 받는다. */
export const AuthStatusJson = z.object({
  loggedIn: z.boolean(),
  /** Console(API 과금) 로그인도 "claude.ai" 로 온다. 방식은 apiKeySource 로 가린다 */
  authMethod: OptionalText,
  apiProvider: OptionalText,
  /** API 키를 쓸 때 그 출처(Console 로그인이면 "/login managed key", 환경 변수면 그 이름 등). 구독 로그인이면 없다 */
  apiKeySource: OptionalText,
  email: OptionalText,
  orgName: OptionalText,
  subscriptionType: OptionalText
})
export type AuthStatusJson = z.infer<typeof AuthStatusJson>

/** 화면에 보여줄 인증 상태. 앱이 아는 경로 정보를 함께 담는다. */
export type AuthStatus = AuthStatusJson & {
  /** CLI가 로그인 정보를 읽은 설정 폴더. */
  configDir: string
  /** 실제로 실행한 CLI 경로. */
  cliPath: string
}

/**
 * Claude Code 의 로그인 방식. claudeai = Claude 구독 계정, console = Anthropic Console(API 사용량 과금).
 * 두 방식 모두 Claude Code 가 자기 창에서 Anthropic 의 흐름으로 진행한다 — 앱은 코드·토큰을 만지지 않는다.
 */
export const LoginMethod = z.enum(['claudeai', 'console'])
export type LoginMethod = z.infer<typeof LoginMethod>

export const AuthLoginStartInput = z.object({ method: LoginMethod })
export type AuthLoginStartInput = z.infer<typeof AuthLoginStartInput>

/** 로그인 창이 닫혔다. 성공 여부는 화면이 로그인 상태를 다시 읽어 판단한다. */
export type AuthLoginDone = { exitCode: number | null }
