import { describe, expect, it } from 'vitest'
import { isUiLanguage, resolveUiLanguage } from './languages'

describe('resolveUiLanguage', () => {
  it('설정에서 고른 언어가 있으면 OS 언어보다 앞선다', () => {
    expect(resolveUiLanguage('en', ['ko-KR'])).toBe('en')
    expect(resolveUiLanguage('ko', ['en-US'])).toBe('ko')
  })

  it.each([
    [['ko-KR', 'en-US'], 'ko'],
    [['ko'], 'ko'],
    [['KO-kr'], 'ko'],
    [['en-US', 'ko-KR'], 'en'],
    [['ja-JP'], 'en'],
    [['kok-IN'], 'en'],
    [[], 'en']
  ] as const)('고른 적이 없으면 첫 번째 OS 표시 언어를 따른다: %j → %s', (languages, expected) => {
    expect(resolveUiLanguage(null, languages)).toBe(expected)
  })
})

describe('isUiLanguage', () => {
  it('지원하는 언어 코드만 받는다', () => {
    expect(isUiLanguage('ko')).toBe(true)
    expect(isUiLanguage('en')).toBe(true)
    expect(isUiLanguage('ja')).toBe(false)
    expect(isUiLanguage(undefined)).toBe(false)
  })
})
