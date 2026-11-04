import { describe, expect, it } from 'vitest'
import {
  buildLanguageOptions,
  COMMON_LANGUAGES,
  customLanguageCode,
  englishLanguageName,
  filterLanguageOptions,
  koreanLanguageName
} from './languages'

const options = buildLanguageOptions()
const codes = (items: readonly { code: string }[]): string[] => items.map((item) => item.code)

describe('buildLanguageOptions', () => {
  it('자주 쓰는 언어가 맨 위, 그 뒤에 Unity 문화권 코드가 겹치지 않게 온다', () => {
    expect(codes(options.slice(0, COMMON_LANGUAGES.length))).toEqual([...COMMON_LANGUAGES])
    expect(options.every((item, index) => item.common === index < COMMON_LANGUAGES.length)).toBe(true)
    const lower = codes(options).map((code) => code.toLowerCase())
    expect(new Set(lower).size).toBe(lower.length)
  })

  it('이름표에 없는 es-419 도 고를 수 있고, 옛 별칭 zh-CHS 는 뺀다', () => {
    expect(codes(options)).toContain('es-419')
    expect(codes(options)).toContain('ko-KR')
    expect(codes(options)).not.toContain('zh-CHS')
  })

  it('한국어 이름과 영어 이름을 붙인다', () => {
    expect(options[0]).toEqual({ code: 'ko', name: '한국어', englishName: 'Korean', common: true })
    expect(options.find((item) => item.code === 'zh-Hant')?.englishName).toBe('Chinese (Traditional)')
    expect(koreanLanguageName('not a code')).toBe('')
    expect(englishLanguageName('zh-Hant')).toBe('Chinese (Traditional)')
    expect(englishLanguageName('ko')).toBe('Korean')
    expect(englishLanguageName('not a code')).toBe('')
  })
})

describe('filterLanguageOptions', () => {
  it('검색어가 없으면 고른 언어만 빼고 그대로', () => {
    const result = filterLanguageOptions(options, '', new Set(['ko', 'EN']))
    expect(codes(result.slice(0, 2))).toEqual(['ja', 'zh-Hans'])
  })

  it('코드가 같은 것 → 코드로 시작하는 것 → 이름이 맞는 것 순', () => {
    const result = codes(filterLanguageOptions(options, 'ja'))
    expect(result[0]).toBe('ja')
    expect(result[1]).toBe('ja-JP')
  })

  it('한국어·영어 이름으로 찾는다', () => {
    expect(codes(filterLanguageOptions(options, '일본어'))).toContain('ja')
    expect(codes(filterLanguageOptions(options, 'brazil'))).toContain('pt-BR')
    expect(codes(filterLanguageOptions(options, '번체'))).toContain('zh-Hant')
  })
})

describe('customLanguageCode', () => {
  it('목록에 없는 올바른 코드만 표준 표기로 돌려준다', () => {
    expect(customLanguageCode(options, 'en-XA')).toBe('en-XA')
    expect(customLanguageCode(options, 'pt-br')).toBeNull()
    expect(customLanguageCode(options, '한국어')).toBeNull()
    expect(customLanguageCode(options, 'en-xa', new Set(['en-XA']))).toBeNull()
  })
})
