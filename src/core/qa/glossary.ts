/**
 * 용어집 검사. 원문에서 용어를 찾고, 번역문이 그 용어의 확정 번역을 썼는지 본다.
 * 규칙은 docs/qa-rules.md 의 "용어집".
 */

export type QaGlossaryTerm = {
  term: string
  /** 대상 언어의 확정 번역. 비어 있는 용어는 검사하지 않는다. */
  translation: string
  strict: boolean
}

/**
 * 언어별 용어 매칭 방식. 문법 판정이 아니라 "어디까지를 한 단어로 보나"만 정한다.
 * 키는 언어 코드의 첫 부분(`zh-Hans` → `zh`).
 */
type MatchingTraits = {
  /** 띄어쓰기가 단어 경계가 아니다(조사·어미가 붙거나 띄어 쓰지 않는다). 원문 탐지에서 부분 문자열로 찾는다. */
  noWordBoundary: boolean
  /** 확정 번역 뒤에 조사가 붙는다. 번역문의 어절이 확정 번역으로 시작하면 통과로 본다. */
  suffixAttaches: boolean
}

const TRAITS: Readonly<Record<string, MatchingTraits>> = {
  ko: { noWordBoundary: true, suffixAttaches: true },
  ja: { noWordBoundary: true, suffixAttaches: false },
  zh: { noWordBoundary: true, suffixAttaches: false }
}
const DEFAULT_TRAITS: MatchingTraits = { noWordBoundary: false, suffixAttaches: false }

function traitsOf(language: string): MatchingTraits {
  const primary = language.toLowerCase().split(/[-_]/)[0] ?? ''
  return TRAITS[primary] ?? DEFAULT_TRAITS
}

const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && char !== '' && WORD_CHAR.test(char)
}

/** 앞뒤가 단어 글자가 아닌 위치에서만 찾는다. */
function findAtBoundaries(haystack: string, needle: string): number[] {
  const found: number[] = []
  let from = 0
  while (needle !== '') {
    const index = haystack.indexOf(needle, from)
    if (index === -1) break
    const before = haystack[index - 1]
    const after = haystack[index + needle.length]
    if (!isWordChar(before) && !isWordChar(after)) found.push(index)
    from = index + 1
  }
  return found
}

function findAll(haystack: string, needle: string): number[] {
  const found: number[] = []
  let from = 0
  while (needle !== '') {
    const index = haystack.indexOf(needle, from)
    if (index === -1) break
    found.push(index)
    from = index + 1
  }
  return found
}

/**
 * 원문에 나오는 용어. 대소문자를 무시하고, 긴 용어를 먼저 맞춘다 —
 * "fire sword" 를 찾은 자리에서는 "sword" 를 다시 찾지 않는다.
 */
export function findTermsInSource<T extends Pick<QaGlossaryTerm, 'term'>>(
  source: string,
  terms: readonly T[],
  sourceLanguage: string
): T[] {
  const haystack = source.toLowerCase()
  const byBoundary = !traitsOf(sourceLanguage).noWordBoundary
  const covered: [number, number][] = []
  const matched: T[] = []

  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length)
  for (const term of sorted) {
    const needle = term.term.trim().toLowerCase()
    if (needle === '') continue
    const positions = byBoundary ? findAtBoundaries(haystack, needle) : findAll(haystack, needle)
    const free = positions.filter(
      (start) => !covered.some(([from, to]) => start < to && start + needle.length > from)
    )
    if (free.length === 0) continue
    for (const start of free) covered.push([start, start + needle.length])
    matched.push(term)
  }
  return matched
}

/**
 * 번역문이 확정 번역을 썼는지. 대소문자는 무시한다.
 * 조사가 붙는 언어는 어절 앞부분 일치로 본다("바벨탑을" ← "바벨탑"). 그냥 포함 여부로 보면
 * "점검" 안의 "검" 처럼 다른 단어 속에 들어간 경우까지 통과해 버린다.
 */
export function usesTranslation(translation: string, fixed: string, targetLanguage: string): boolean {
  const haystack = translation.toLowerCase()
  const needle = fixed.trim().toLowerCase()
  if (needle === '') return true
  if (!traitsOf(targetLanguage).suffixAttaches) return haystack.includes(needle)
  return findAll(haystack, needle).some((index) => !isWordChar(haystack[index - 1]))
}

export type GlossaryViolation = { term: string; translation: string; strict: boolean }

/** 원문에 나오는데 번역문이 확정 번역을 쓰지 않은 용어 */
export function findGlossaryViolations(
  source: string,
  translation: string,
  terms: readonly QaGlossaryTerm[],
  languages: { source: string; target: string }
): GlossaryViolation[] {
  const checkable = terms.filter((term) => term.translation.trim() !== '')
  return findTermsInSource(source, checkable, languages.source)
    .filter((term) => !usesTranslation(translation, term.translation, languages.target))
    .map((term) => ({ term: term.term, translation: term.translation, strict: term.strict }))
}
