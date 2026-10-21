import { describe, expect, it } from 'vitest'
import { findGlossaryViolations, findTermsInSource, usesTranslation, type QaGlossaryTerm } from './glossary'

const term = (text: string, translation = '', strict = false): QaGlossaryTerm => ({ term: text, translation, strict })
const names = (terms: readonly QaGlossaryTerm[]): string[] => terms.map((item) => item.term)

describe('findTermsInSource', () => {
  it('대소문자 무시, 단어 경계 기준', () => {
    const terms = [term('Sword'), term('art')]
    expect(names(findTermsInSource('Take the sword. Start!', terms, 'en'))).toEqual(['Sword'])
  })

  it('긴 용어를 먼저 맞추고 그 자리에서는 짧은 용어를 다시 찾지 않는다', () => {
    const terms = [term('sword'), term('fire sword')]
    expect(names(findTermsInSource('A fire sword appears.', terms, 'en'))).toEqual(['fire sword'])
    expect(names(findTermsInSource('A fire sword and a sword.', terms, 'en'))).toEqual(['fire sword', 'sword'])
  })

  it('단어 경계가 없는 언어는 부분 문자열로 찾는다', () => {
    const terms = [term('바벨탑'), term('剣')]
    expect(names(findTermsInSource('바벨탑을 올랐다', terms, 'ko'))).toEqual(['바벨탑'])
    expect(names(findTermsInSource('炎の剣を手に入れた', terms, 'ja'))).toEqual(['剣'])
    expect(names(findTermsInSource('바벨탑을 올랐다', terms, 'en'))).toEqual([])
  })

  it('언어 코드의 지역 부분은 무시한다', () => {
    expect(names(findTermsInSource('火之剑', [term('剑')], 'zh-Hans'))).toEqual(['剑'])
  })
})

describe('usesTranslation', () => {
  it('기본은 포함 여부, 대소문자 무시', () => {
    expect(usesTranslation('Climb the Tower of Babel', 'tower of babel', 'en')).toBe(true)
    expect(usesTranslation('Climb the tower', 'Tower of Babel', 'en')).toBe(false)
  })

  it('한국어는 어절 앞부분 일치 — 조사가 붙어도 통과', () => {
    expect(usesTranslation('바벨탑을 올랐다', '바벨탑', 'ko')).toBe(true)
    expect(usesTranslation('"바벨탑"에서', '바벨탑', 'ko')).toBe(true)
  })

  it('한국어는 다른 단어 속에 들어간 경우를 통과시키지 않는다', () => {
    expect(usesTranslation('장비를 점검했다', '검', 'ko')).toBe(false)
    expect(usesTranslation('검을 들었다', '검', 'ko')).toBe(true)
  })

  it('여러 어절로 된 확정 번역', () => {
    expect(usesTranslation('불의 검을 얻었다', '불의 검', 'ko')).toBe(true)
  })
})

describe('findGlossaryViolations', () => {
  const terms = [term('Babel Tower', '바벨탑', true), term('Potion', '물약'), term('Mana', '')]
  const languages = { source: 'en', target: 'ko' }

  it('확정 번역을 쓰지 않은 용어만 낸다', () => {
    expect(findGlossaryViolations('Use a Potion at Babel Tower', '바벨탑에서 포션을 쓰세요', terms, languages)).toEqual([
      { term: 'Potion', translation: '물약', strict: false }
    ])
  })

  it('확정 번역이 빈 용어는 검사하지 않는다', () => {
    expect(findGlossaryViolations('Mana', '마력', terms, languages)).toEqual([])
  })

  it('strict 표시를 그대로 넘긴다', () => {
    expect(findGlossaryViolations('Babel Tower', '탑', terms, languages)).toEqual([
      { term: 'Babel Tower', translation: '바벨탑', strict: true }
    ])
  })
})
