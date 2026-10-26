import { describe, expect, it } from 'vitest'
import { describeInjectedTerms, filterTermsForTexts, parseGlossary } from './glossary'

const records = [
  { term: 'Babel', translation_en: 'Babel', status: 'approved', note: '고유명사', strict: 'true' },
  { term: '물약', translation_en: 'Potion', status: '', note: '', strict: '' },
  { term: '대장장이', translation_en: 'Smith', status: 'pending', note: '', strict: '' },
  { term: '빈 용어', translation_en: '', status: 'approved', note: '', strict: '' },
  { term: '', translation_en: 'x', status: 'approved', note: '', strict: '' }
]

describe('parseGlossary', () => {
  it('승인되었거나 상태가 빈 용어만, 번역이나 지침이 있는 것만', () => {
    const terms = parseGlossary(records, 'en')
    expect(terms.map((term) => term.term)).toEqual(['Babel', '물약'])
    expect(terms[0]?.strict).toBe(true)
  })

  it('언어별 번역 열을 읽는다', () => {
    expect(parseGlossary([{ term: '검', translation_ja: '剣' }], 'ja')[0]?.translation).toBe('剣')
  })

  it('승인 전 상태(pending 외 다른 값 포함)는 넣지 않는다', () => {
    expect(parseGlossary([{ term: '검', translation_ja: '剣', status: 'rejected' }], 'ja')).toEqual([])
  })
})

describe('filterTermsForTexts', () => {
  const terms = parseGlossary(records, 'en')

  it('문자열에 나오는 용어만 고른다(한국어는 부분 문자열)', () => {
    expect(filterTermsForTexts(terms, ['체력 물약을, 소형'], 'ko').map((term) => term.term)).toEqual(['물약'])
  })

  it('대소문자를 무시한다', () => {
    expect(filterTermsForTexts(terms, ['the tower of BABEL'], 'en').map((term) => term.term)).toEqual(['Babel'])
  })

  it('띄어 쓰는 언어는 단어 경계로 찾는다 — 다른 단어 속의 용어는 넣지 않는다', () => {
    const english = [{ term: 'art' }, { term: 'Mana' }]
    expect(filterTermsForTexts(english, ['Start the game', 'Manager'], 'en')).toEqual([])
    expect(filterTermsForTexts(english, ['Pixel art', 'Restore mana.'], 'en')).toEqual(english)
  })

  it('긴 용어를 먼저 맞춘다 — 긴 용어 안의 짧은 용어는 따로 넣지 않는다', () => {
    const english = [{ term: 'sword' }, { term: 'fire sword' }]
    expect(filterTermsForTexts(english, ['Equip the fire sword'], 'en')).toEqual([{ term: 'fire sword' }])
  })

  it('여러 문자열의 결과를 합치고 용어집 순서를 따른다', () => {
    expect(filterTermsForTexts(terms, ['물약 하나', 'Babel 탑'], 'ko').map((term) => term.term)).toEqual(['Babel', '물약'])
  })

  it('아무것도 없으면 빈 목록', () => {
    expect(filterTermsForTexts(terms, ['게임 시작'], 'ko')).toEqual([])
  })
})

describe('describeInjectedTerms', () => {
  it('용어가 없으면 0개', () => {
    expect(describeInjectedTerms([])).toEqual({ text: '용어 0개' })
  })

  it('이름은 여섯 개까지 쓰고, 상세에는 확정 번역과 strict 를 모두 담는다', () => {
    const terms = Array.from({ length: 7 }, (_, index) => ({ term: `t${index}`, translation: index === 0 ? 'T0' : '', note: '', strict: index === 0 }))
    const described = describeInjectedTerms(terms)
    expect(described.text).toBe('용어 7개: t0, t1, t2, t3, t4, t5 …')
    expect(described.detail?.split('\n')[0]).toBe('t0 → T0 (strict)')
    expect(described.detail?.split('\n')).toHaveLength(7)
  })
})
