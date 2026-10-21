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
 */
export function parseGlossary(records: readonly Record<string, string>[], language: string): GlossaryTerm[] {
  const terms: GlossaryTerm[] = []
  for (const record of records) {
    const term = (record['term'] ?? '').trim()
    if (term === '') continue
    const status = (record['status'] ?? '').trim().toLowerCase()
    if (status !== '' && status !== 'approved') continue
    const translation = (record[`translation_${language}`] ?? '').trim()
    const note = (record['note'] ?? '').trim()
    // 확정 번역도 지침도 없으면 프롬프트에 넣어 봐야 쓸 정보가 없다
    if (translation === '' && note === '') continue
    terms.push({ term, translation, note, strict: (record['strict'] ?? '').trim().toLowerCase() === 'true' })
  }
  return terms
}

/**
 * 배치 문자열에 실제로 나오는 용어만 고른다. 전체 용어집을 매번 넣지 않기 위해서다.
 * M3는 대소문자 무시 부분 일치만 본다. 단어 경계·활용형 매칭은 QA(M4)·용어집(M5)에서 다룬다.
 */
export function filterTermsForTexts(terms: readonly GlossaryTerm[], texts: readonly string[]): GlossaryTerm[] {
  const haystack = texts.join('\n').toLowerCase()
  return terms.filter((term) => haystack.includes(term.term.toLowerCase()))
}
