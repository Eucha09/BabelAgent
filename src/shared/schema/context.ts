import { z } from 'zod'
import type { EncodingNotice } from './strings'

/** 에이전트가 제안할 수 있는 strings_master.csv 메타데이터 열. 원문(source)과 키는 건드리지 않는다. */
export const ContextField = z.enum(['context', 'ui_type', 'max_len', 'vars'])
export type ContextField = z.infer<typeof ContextField>
export const CONTEXT_FIELDS: readonly ContextField[] = ContextField.options

/** context_suggestions.csv 의 열. 순서가 곧 파일의 열 순서다. */
export const SUGGESTION_COLUMNS = [
  'key',
  'source_hash',
  'context',
  'ui_type',
  'max_len',
  'vars',
  'confidence',
  'note'
] as const

/**
 * 승인을 기다리는 메타데이터 제안 한 행. 빈 칸은 "그 필드는 제안하지 않음"이다.
 * source_hash 는 제안할 때 본 원문의 해시 — 그 뒤 원문이 바뀌면 제안을 믿을 수 없다.
 */
export type ContextSuggestion = {
  key: string
  source_hash: string
  context: string
  ui_type: string
  max_len: string
  vars: string
  confidence: string
  note: string
}

export type ContextFieldValues = Record<ContextField, string>

/** 컨텍스트 화면 한 줄. 제안과 지금 원문 행을 나란히 보여 준다. */
export type ContextSuggestionView = ContextSuggestion & {
  source: string
  /** strings_master.csv 의 지금 값 */
  current: ContextFieldValues
  /** 제안한 뒤 원문이 바뀌었다 */
  stale: boolean
  /** 원문에서 사라진 키 */
  missing: boolean
}

export type ContextView = {
  suggestions: ContextSuggestionView[]
  notices: EncodingNotice[]
}

/** empty: 고른 필드 중 빈 칸이 있는 모든 행, selected: 고른 행 중 빈 칸이 있는 행 */
export const ContextScope = z.enum(['empty', 'selected'])
export type ContextScope = z.infer<typeof ContextScope>

export const StartContextInput = z.object({
  fields: z.array(ContextField).min(1),
  scope: ContextScope,
  /** scope 가 selected 일 때만 쓴다 */
  keys: z.array(z.string())
})
export type StartContextInput = z.infer<typeof StartContextInput>

const FieldValues = z
  .object({ context: z.string(), ui_type: z.string(), max_len: z.string(), vars: z.string() })
  .partial()

/**
 * 제안 적용. values 는 사람이 고친 뒤의 값(빈 값은 그 필드를 적용하지 않음), expected 는 화면이 본
 * strings_master.csv 의 지금 값이다. 그 사이 원문 행이 바뀌었으면 덮지 않고 건너뛴다.
 */
export const ApplyContextInput = z.object({
  items: z
    .array(z.object({ key: z.string().min(1), values: FieldValues, expected: FieldValues }))
    .min(1)
})
export type ApplyContextInput = z.infer<typeof ApplyContextInput>
export type ApplyContextItem = ApplyContextInput['items'][number]

export type ContextSkipReason = 'missing' | 'changed' | 'invalid' | 'empty'

export type ApplyContextResult = {
  applied: string[]
  skipped: { key: string; reason: ContextSkipReason; detail?: string }[]
}

export const DiscardContextInput = z.object({ keys: z.array(z.string().min(1)).min(1) })
export type DiscardContextInput = z.infer<typeof DiscardContextInput>
