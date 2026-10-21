import { z } from 'zod'
import type { QaDiagnostic, QaRuleId } from '@shared/schema/qa'
import { STRUCTURAL_RULES } from '../qa/check'

/** 에이전트가 submit_translations 로 내는 한 행. MCP 도구의 입력 스키마로도 쓴다. */
export const SubmittedTranslation = z.object({
  key: z.string().min(1),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  note: z.string().optional()
})
export type SubmittedTranslation = z.infer<typeof SubmittedTranslation>

/** 도구 입력 모양(zod raw shape). SDK 의 tool() 이 이 형태를 받는다. */
export const SUBMIT_INPUT_SHAPE = { translations: z.array(SubmittedTranslation) }

export type SubmissionProblems = {
  /** 배치에 있는데 제출에 없는 키 */
  missing: string[]
  /** 배치에 없는데 제출된 키 */
  extra: string[]
  duplicates: string[]
  /** 번역문이 비어 있는 키 */
  empty: string[]
}

export type SubmissionCheck = { ok: true } | { ok: false; problems: SubmissionProblems }

/**
 * 제출이 배치와 정확히 맞는지 본다. 키는 하나도 빠지거나 남거나 겹치면 안 된다.
 * 변수·태그 같은 내용 검사(QA)는 judgeSubmission 이 이 뒤에 붙인다.
 */
export function checkSubmission(
  expectedKeys: readonly string[],
  items: readonly Pick<SubmittedTranslation, 'key' | 'text'>[]
): SubmissionCheck {
  const expected = new Set(expectedKeys)
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const extra: string[] = []
  const empty: string[] = []

  for (const item of items) {
    if (seen.has(item.key)) duplicates.add(item.key)
    seen.add(item.key)
    if (!expected.has(item.key)) extra.push(item.key)
    else if (item.text.trim() === '') empty.push(item.key)
  }
  const missing = expectedKeys.filter((key) => !seen.has(key))

  const problems = { missing, extra, duplicates: [...duplicates], empty }
  const failed = missing.length + extra.length + problems.duplicates.length + empty.length > 0
  return failed ? { ok: false, problems } : { ok: true }
}

/** 문제를 에이전트가 고치기 쉬운 짧은 문장으로 바꾼다. 도구 응답에 실린다. */
export function describeProblems(problems: SubmissionProblems): string {
  const parts: string[] = []
  if (problems.missing.length > 0) parts.push(`missing keys: ${problems.missing.join(', ')}`)
  if (problems.extra.length > 0) parts.push(`unknown keys: ${problems.extra.join(', ')}`)
  if (problems.duplicates.length > 0) parts.push(`duplicate keys: ${problems.duplicates.join(', ')}`)
  if (problems.empty.length > 0) parts.push(`empty text: ${problems.empty.join(', ')}`)
  return parts.join('; ')
}

/** 제출된 행의 QA 오류 하나. 에이전트에게 돌려줄 때는 짧은 영어로 바꾼다. */
export type SubmissionIssue = { key: string; ruleId: QaRuleId; items: string[] }

export type SubmissionVerdict =
  /** 기록한다. unresolved 는 남은 비구조 오류(길이·strict 용어) — 검토 화면이 오류로 띄운다. */
  | { kind: 'accept'; unresolved: SubmissionIssue[] }
  /** 문제를 돌려주고 한 번 더 받는다. */
  | { kind: 'retry'; problems: string }
  /** 더 받지 않는다. 배치는 기록하지 않는다. */
  | { kind: 'reject'; problems: string }

/**
 * - batch: 배치 번역. 마지막 제출에 구조 오류(변수·중괄호·태그)가 남으면 배치를 거부한다.
 * - candidate: 행 재번역. 결과를 쓰지 않고 후보로 보여 주므로 QA 오류가 남아도 받고, 사람이 고른다.
 */
export type SubmissionMode = 'batch' | 'candidate'

export function describeIssues(issues: readonly SubmissionIssue[]): string {
  return issues
    .map((issue) => `${issue.key}: ${issue.ruleId}${issue.items.length > 0 ? ` (${issue.items.join(', ')})` : ''}`)
    .join('; ')
}

/**
 * 제출 하나를 판정한다. 키 검사 → 행별 QA 순서.
 * 첫 제출에서는 QA 오류(경고는 빼고)를 모두 돌려줘 고칠 기회를 준다. 마지막 제출에서는 mode 에 따라
 * 구조 오류만 거부하거나(batch), 키 문제만 거부한다(candidate).
 */
export function judgeSubmission(input: {
  expectedKeys: readonly string[]
  items: readonly SubmittedTranslation[]
  final: boolean
  mode: SubmissionMode
  qa: (item: SubmittedTranslation) => readonly QaDiagnostic[]
}): SubmissionVerdict {
  const keys = checkSubmission(input.expectedKeys, input.items)
  if (!keys.ok) {
    const problems = describeProblems(keys.problems)
    return input.final ? { kind: 'reject', problems } : { kind: 'retry', problems }
  }

  const issues: SubmissionIssue[] = input.items.flatMap((item) =>
    input
      .qa(item)
      .filter((diagnostic) => diagnostic.severity === 'error')
      .map((diagnostic) => ({ key: item.key, ruleId: diagnostic.ruleId, items: diagnostic.items }))
  )
  if (issues.length === 0) return { kind: 'accept', unresolved: [] }
  if (!input.final) return { kind: 'retry', problems: describeIssues(issues) }
  if (input.mode === 'candidate') return { kind: 'accept', unresolved: issues }

  const structural = issues.filter((issue) => STRUCTURAL_RULES.has(issue.ruleId))
  if (structural.length > 0) return { kind: 'reject', problems: describeIssues(structural) }
  return { kind: 'accept', unresolved: issues }
}
