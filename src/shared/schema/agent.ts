import { z } from 'zod'

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

export type AgentChatDelta = { requestId: string; text: string }
export type AgentChatEnd = { requestId: string; sessionId: string | null; durationMs: number }
export type AgentChatError = { requestId: string } & AgentError

/** `claude auth status --json` 출력. CLI가 필드를 늘려도 깨지지 않게 느슨하게 받는다. */
export const AuthStatusJson = z.object({
  loggedIn: z.boolean(),
  authMethod: z.string().optional(),
  apiProvider: z.string().optional(),
  email: z.string().optional(),
  orgName: z.string().optional(),
  subscriptionType: z.string().optional()
})
export type AuthStatusJson = z.infer<typeof AuthStatusJson>

/** 화면에 보여줄 인증 상태. 앱이 아는 경로 정보를 함께 담는다. */
export type AuthStatus = AuthStatusJson & {
  /** CLI가 로그인 정보를 읽은 설정 폴더. */
  configDir: string
  /** 실제로 실행한 CLI 경로. */
  cliPath: string
}

export const AuthLoginInput = z.object({
  /** 브라우저가 코드를 보여주는 경우 사용자가 붙여넣는 값. */
  text: z.string()
})
export type AuthLoginInput = z.infer<typeof AuthLoginInput>

/** 로그인 진행 중 CLI가 뱉는 줄. 그대로 화면에 쌓는다. */
export type AuthLoginOutput = { text: string }
export type AuthLoginDone = { ok: boolean; detail?: string }
