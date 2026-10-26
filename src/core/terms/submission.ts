import { z } from 'zod'
import { termKey, type GlossaryCandidate } from '../glossary/entries'
import { findTermsInSource } from '../qa/glossary'
import { settleItems, type SubmitVerdict } from '../submit'

/** 에이전트가 submit_terms(배치)·propose_glossary_terms(패널)로 내는 후보 하나. 도구 입력 스키마로도 쓴다. */
export const SubmittedTerm = z.object({
  term: z.string().min(1),
  pos: z.string().optional(),
  translations: z.array(z.object({ language: z.string(), text: z.string() })).optional(),
  note: z.string().optional(),
  reason: z.string().optional(),
  confidence: z.number().min(0).max(1)
})
export type SubmittedTerm = z.infer<typeof SubmittedTerm>

/** 도구 입력 모양(zod raw shape) */
export const TERMS_INPUT_SHAPE = { terms: z.array(SubmittedTerm) }

/** 자리표시자·태그는 용어가 아니다. 들어가면 QA 의 용어 탐지가 엉뚱하게 걸린다. */
const MARKUP = /[{}<>]/

export type TermsCheckInput = {
  items: readonly SubmittedTerm[]
  targetLanguages: readonly string[]
  /** 용어집에 이미 있는 용어(승인 대기 포함). 다시 낸 후보는 문제로 보지 않고 조용히 뺀다 */
  existing: ReadonlySet<string>
  /** 주면 후보가 이 문자열들 중 하나에 실제로 나와야 한다(배치 추출). 패널 제안은 주지 않는다 */
  sources?: { texts: readonly string[]; language: string }
}

export type TermsCheck = {
  valid: GlossaryCandidate[]
  /** 에이전트에게 돌려줄 짧은 영어 */
  issues: string[]
  /** 이미 있어서 뺀 용어 */
  known: string[]
}

export function checkTerms(input: TermsCheckInput): TermsCheck {
  const languages = new Set(input.targetLanguages)
  const seen = new Set<string>()
  const valid: GlossaryCandidate[] = []
  const issues: string[] = []
  const known: string[] = []

  for (const item of input.items) {
    const term = item.term.trim()
    const key = termKey(term)
    if (key === '') continue
    if (MARKUP.test(term)) {
      issues.push(`"${term}": placeholders and tags are not glossary terms`)
      continue
    }
    if (seen.has(key)) {
      issues.push(`"${term}": duplicate`)
      continue
    }
    seen.add(key)
    if (input.existing.has(key)) {
      known.push(term)
      continue
    }
    const sources = input.sources
    if (sources && !sources.texts.some((text) => findTermsInSource(text, [{ term }], sources.language).length > 0)) {
      issues.push(`"${term}": not found in the source strings`)
      continue
    }
    const unknown = (item.translations ?? []).map((entry) => entry.language).filter((language) => !languages.has(language))
    if (unknown.length > 0) {
      issues.push(`"${term}": unknown language ${unknown.join(', ')} (use ${input.targetLanguages.join(', ')})`)
      continue
    }
    valid.push({
      term,
      pos: (item.pos ?? '').trim(),
      note: (item.note ?? '').trim(),
      translations: Object.fromEntries((item.translations ?? []).map((entry) => [entry.language, entry.text.trim()])),
      reason: (item.reason ?? '').trim(),
      confidence: item.confidence
    })
  }
  return { valid, issues, known }
}

/**
 * 배치 추출 제출의 판정. 문제 있는 후보는 첫 제출이면 돌려줘 고치게 하고, 마지막 제출이면 버린다.
 * 빈 목록도 받는다 — 새 용어가 없는 배치가 있다.
 */
export function judgeTerms(input: TermsCheckInput & { final: boolean }): SubmitVerdict<GlossaryCandidate> {
  const { valid, issues } = checkTerms(input)
  return settleItems(valid, issues, input.final, false)
}
