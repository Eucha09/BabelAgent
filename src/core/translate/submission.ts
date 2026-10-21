import { z } from 'zod'

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
 * 변수·태그 같은 내용 검사(QA)는 M4에서 이 뒤에 붙는다.
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
