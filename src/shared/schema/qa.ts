import { z } from 'zod'

/** QA 규칙 식별자. 목록과 심각도는 docs/qa-rules.md 의 표를 따른다. */
export const QaRuleId = z.enum([
  'var.missing',
  'var.extra',
  'var.meta_mismatch',
  'var.meta_invalid',
  'smart.brace_unbalanced',
  'smart.unknown_formatter',
  'tag.set_mismatch',
  'tag.unclosed',
  'len.over_max',
  'text.empty',
  'glossary.violation',
  'glossary.violation_strict',
  'status.stale'
])
export type QaRuleId = z.infer<typeof QaRuleId>

/** error 는 내보내기를 막고 warning 은 막지 않는다. */
export type QaSeverity = 'error' | 'warning'

export type QaDiagnostic = {
  ruleId: QaRuleId
  severity: QaSeverity
  key: string
  /** 화면에 보여줄 한 줄 설명 */
  message: string
  detail?: string
  /** 문제가 된 변수·태그·용어 등. 에이전트에게 고칠 대상을 짧게 알려 줄 때도 쓴다. */
  items: string[]
}

export const QaRunInput = z.object({ language: z.string().min(1) })
export type QaRunInput = z.infer<typeof QaRunInput>

export type QaReport = {
  language: string
  /** 진단이 있는 키만 담는다. */
  diagnostics: Record<string, QaDiagnostic[]>
  /** 용어집을 읽지 못한 경우처럼 검사 전체에 걸린 알림 */
  notices: string[]
}
