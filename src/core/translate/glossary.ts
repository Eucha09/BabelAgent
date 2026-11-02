import { glossaryStatusOf, isStrict, isTranslationConfirmed, translationColumn } from '../glossary/entries'
import { findTermsInSource } from '../qa/glossary'

/** 번역 프롬프트에 넣을 용어 하나. */
export type GlossaryTerm = {
  term: string
  translation: string
  note: string
  strict: boolean
}

/**
 * glossary.csv 레코드에서 해당 언어의 용어를 읽는다.
 * status 가 pending 인 항목(에이전트 제안, 승인 전)은 넣지 않는다.
 * status 열이 없거나 비어 있으면 사람이 직접 쓴 용어로 보고 승인된 것으로 친다.
 * 승인된 용어라도 이 언어가 pending_languages 에 있으면(용어 번역이 채우고 아직 승인 전) 번역은 빼고 지침만 쓴다.
 */
export function parseGlossary(records: readonly Record<string, string>[], language: string): GlossaryTerm[] {
  const terms: GlossaryTerm[] = []
  for (const record of records) {
    const term = (record['term'] ?? '').trim()
    if (term === '') continue
    if (glossaryStatusOf(record['status'] ?? '') !== 'approved') continue
    const translation = isTranslationConfirmed(record, language) ? (record[translationColumn(language)] ?? '').trim() : ''
    const note = (record['note'] ?? '').trim()
    // 확정 번역도 지침도 없으면 프롬프트에 넣어 봐야 쓸 정보가 없다
    if (translation === '' && note === '') continue
    terms.push({ term, translation, note, strict: isStrict(record['strict'] ?? '') })
  }
  return terms
}

/**
 * 승인된 용어 중 이 언어의 확정 번역이 없는 용어(칸이 비었거나 그 언어가 승인 대기). 번역 작업을 시작할 때
 * "용어집을 먼저 채우라"고 알리는 데 쓴다 — 이런 용어는 번역 프롬프트에 번역 없이(지침만) 들어가고 QA 도 보지 않는다.
 */
export function termsWithoutConfirmedTranslation(records: readonly Record<string, string>[], language: string): string[] {
  const terms: string[] = []
  for (const record of records) {
    const term = (record['term'] ?? '').trim()
    if (term === '' || glossaryStatusOf(record['status'] ?? '') !== 'approved') continue
    const translation = (record[translationColumn(language)] ?? '').trim()
    if (translation === '' || !isTranslationConfirmed(record, language)) terms.push(term)
  }
  return terms
}

/**
 * 배치 문자열에 실제로 나오는 용어만 고른다. 전체 용어집을 매번 넣지 않기 위해서다.
 * 찾는 방식은 QA 의 용어 탐지와 같다(findTermsInSource) — 띄어 쓰는 언어는 단어 경계로, 한·중·일은
 * 부분 문자열로 찾고, 긴 용어를 먼저 맞춘다. 그래야 QA 가 검사하는 용어와 프롬프트에 넣은 용어가 같다.
 * 문자열마다 찾아 합치며, 순서는 용어집 순서를 따른다.
 */
export function filterTermsForTexts<T extends Pick<GlossaryTerm, 'term'>>(
  terms: readonly T[],
  texts: readonly string[],
  sourceLanguage: string
): T[] {
  const found = new Set<T>()
  for (const text of texts) {
    for (const term of findTermsInSource(text, terms, sourceLanguage)) found.add(term)
  }
  return terms.filter((term) => found.has(term))
}

/** 로그에 용어를 몇 개까지 이름으로 보여 줄지. 전체 목록은 상세에 둔다. */
const TERMS_IN_MESSAGE = 6

/** 배치에 넣은 용어를 작업 로그 한 줄로. 이 줄로 "배치에 그 배치의 용어만 들어갔는지"를 확인한다. */
export function describeInjectedTerms(terms: readonly GlossaryTerm[]): { text: string; detail?: string } {
  if (terms.length === 0) return { text: '용어 0개' }
  const names = terms.map((term) => term.term)
  const shown = names.slice(0, TERMS_IN_MESSAGE).join(', ')
  const text = `용어 ${terms.length}개: ${shown}${names.length > TERMS_IN_MESSAGE ? ' …' : ''}`
  const detail = terms
    .map((term) => `${term.term}${term.translation ? ` → ${term.translation}` : ''}${term.strict ? ' (strict)' : ''}`)
    .join('\n')
  return { text, detail }
}
