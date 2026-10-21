import { describe, expect, it } from 'vitest'
import { filterTermsForTexts, parseGlossary } from './glossary'

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
})

describe('filterTermsForTexts', () => {
  const terms = parseGlossary(records, 'en')

  it('문자열에 나오는 용어만 고른다', () => {
    expect(filterTermsForTexts(terms, ['체력 물약, 소형']).map((term) => term.term)).toEqual(['물약'])
  })

  it('대소문자를 무시한다', () => {
    expect(filterTermsForTexts(terms, ['the tower of BABEL']).map((term) => term.term)).toEqual(['Babel'])
  })

  it('아무것도 없으면 빈 목록', () => {
    expect(filterTermsForTexts(terms, ['게임 시작'])).toEqual([])
  })
})
