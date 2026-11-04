import { z } from 'zod'

/** 번역할 행을 고르는 범위. approved 는 어느 범위에서도 빠진다. */
export const TranslateScope = z.enum(['all', 'untranslated', 'stale', 'selected'])
export type TranslateScope = z.infer<typeof TranslateScope>

/** 배치 번역 모델. default 는 Claude Code CLI 에 설정된 모델을 그대로 쓴다. */
export const TranslateModel = z.enum(['default', 'opus', 'sonnet', 'haiku'])
export type TranslateModel = z.infer<typeof TranslateModel>

/**
 * 사고 수준. Agent SDK 의 effort 값을 그대로 쓴다(EffortLevel).
 * 모델이 지원하지 않는 수준은 CLI 가 그 모델이 지원하는 수준으로 낮춘다.
 */
export const TranslateEffort = z.enum(['low', 'medium', 'high', 'xhigh', 'max'])
export type TranslateEffort = z.infer<typeof TranslateEffort>

export const StartTranslateInput = z.object({
  language: z.string().min(1),
  scope: TranslateScope,
  /** scope 가 selected 일 때만 쓴다. */
  keys: z.array(z.string()),
  model: TranslateModel,
  effort: TranslateEffort
})
export type StartTranslateInput = z.infer<typeof StartTranslateInput>

export const JobControlInput = z.object({ action: z.enum(['pause', 'resume', 'cancel', 'retry']) })
export type JobControlInput = z.infer<typeof JobControlInput>

export type JobState = 'running' | 'paused' | 'waiting-limit' | 'done' | 'cancelled'
export type BatchStatus = 'queued' | 'running' | 'done' | 'failed'
export type JobFailure = { batchId: number; reason: string; detail?: string }

export type JobSnapshot = {
  state: JobState
  totalBatches: number
  totalRows: number
  doneRows: number
  failedRows: number
  running: number
  queued: number
  /** 한도 대기 뒤 자동으로 다시 시작할 시각(epoch ms). null이면 사용자 조작을 기다린다. */
  resumeAt: number | null
  limitAttempts: number
  failures: JobFailure[]
  batches: { id: number; size: number; status: BatchStatus }[]
}

/**
 * 배치 작업 종류. 종류와 상관없이 한 번에 하나만 돈다 — 같은 사용량 한도를 나눠 쓰고,
 * 진행 카드·로그·제어를 같이 쓴다.
 */
export const JobKind = z.enum(['translate', 'context', 'terms', 'term-translate'])
export type JobKind = z.infer<typeof JobKind>

export type JobView = {
  id: string
  kind: JobKind
  /** 번역 작업의 대상 언어. 컨텍스트 추정·용어 추출은 null */
  language: string | null
  /** 진행 카드에 보여 줄 범위 설명. 예: "en · 미번역" */
  summary: string
  model: TranslateModel
  effort: TranslateEffort
  startedAt: string
  /** 범위에서 뺀 행처럼 함께 알릴 것. 예: "승인 3행 제외" */
  notes: string[]
  snapshot: JobSnapshot
}

export type JobLogLevel = 'info' | 'ok' | 'warn' | 'error'

/** 배치 작업 로그 한 줄. 번역 화면과 에이전트 패널의 작업 로그에 쌓인다. */
export type JobLogEntry = {
  at: string
  level: JobLogLevel
  batchId: number | null
  message: string
  detail?: string
}

/** 에이전트 패널 채팅에서 에이전트가 부른 도구 한 번. */
export type ChatToolCall = {
  requestId: string
  name: string
  summary: string
  ok: boolean
}

/**
 * 작업이나 패널 도구가 프로젝트 파일(용어집·컨텍스트 제안)을 썼다. 앱이 쓴 파일은 감시자가 알려 주지 않으므로
 * 그 파일을 보는 화면이 다시 읽도록 따로 알린다.
 */
export type DataWritten = { file: string }
