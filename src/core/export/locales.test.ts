import { describe, expect, it } from 'vitest'
import { defaultColumnName, matchUnityLocale, resolveLocales, unityEnglishName } from './locales'

describe('unityEnglishName (Unity Mono 이름표)', () => {
  it('Unity 가 쓰는 이름을 돌려준다', () => {
    expect(unityEnglishName('en')).toBe('English')
    expect(unityEnglishName('ko')).toBe('Korean')
    expect(unityEnglishName('zh-Hans')).toBe('Chinese (Simplified)')
  })

  it('CLDR 과 다른 Mono 이름을 따른다', () => {
    expect(unityEnglishName('zh-CN')).toBe('Chinese (Simplified)')
    expect(unityEnglishName('zh-TW')).toBe('Chinese (Traditional)')
    expect(unityEnglishName('tr-TR')).toBe('Turkish (Turkey)')
    expect(unityEnglishName('cs-CZ')).toBe('Czech (Czech Republic)')
  })

  it('표에 없으면 마지막 하위 태그를 떼어 가며 찾는다(Mono 와 같음)', () => {
    expect(unityEnglishName('es-419')).toBe('Spanish')
    expect(unityEnglishName('en-XA')).toBe('English')
    expect(unityEnglishName('zh-Hans-CN')).toBe('Chinese (Simplified)')
  })

  it('대소문자를 무시하고, 끝내 없으면 null', () => {
    expect(unityEnglishName('ZH-hans')).toBe('Chinese (Simplified)')
    expect(unityEnglishName('pseudo')).toBeNull()
    expect(unityEnglishName('qps-ploc')).toBeNull()
  })
})

describe('defaultColumnName', () => {
  it('{EnglishName}({코드}) — 코드 표기는 그대로 둔다', () => {
    expect(defaultColumnName('en')).toBe('English(en)')
    expect(defaultColumnName('zh-Hans')).toBe('Chinese (Simplified)(zh-Hans)')
    expect(defaultColumnName('EN')).toBe('English(EN)')
  })

  it('CultureInfo 가 없는 코드는 Custom', () => {
    expect(defaultColumnName('pseudo')).toBe('Custom(pseudo)')
  })
})

describe('matchUnityLocale', () => {
  const unity = [
    { code: 'en', name: 'English (en)' },
    { code: 'zh-Hans', name: 'Chinese (Simplified) (zh-Hans)' },
    { code: 'zh-Hant', name: 'Chinese (Traditional) (zh-Hant)' },
    { code: 'pt-BR', name: 'Portuguese (Brazil) (pt-BR)' }
  ]

  it('대소문자 무시 일치', () => {
    expect(matchUnityLocale('ZH-HANS', unity)?.code).toBe('zh-Hans')
  })

  it('기본 언어가 같은 로케일이 하나뿐이면 그것', () => {
    expect(matchUnityLocale('en-US', unity)?.code).toBe('en')
    expect(matchUnityLocale('pt', unity)?.code).toBe('pt-BR')
  })

  it('둘 이상이면 추측하지 않는다', () => {
    expect(matchUnityLocale('zh', unity)).toBeNull()
    expect(matchUnityLocale('ja', unity)).toBeNull()
  })
})

describe('resolveLocales', () => {
  it('설정이 없으면 프로젝트 코드와 기본 이름', () => {
    const { locales, warnings } = resolveLocales(['ko', 'en'], 'ko', {}, null)
    expect(locales.map((locale) => [locale.unityLocaleCode, locale.columnName, locale.codeOrigin, locale.nameOrigin])).toEqual([
      ['ko', 'Korean(ko)', 'project', 'auto'],
      ['en', 'English(en)', 'project', 'auto']
    ])
    expect(locales[0]?.isSource).toBe(true)
    expect(warnings).toEqual([])
  })

  it('설정한 코드와 이름이 앞선다', () => {
    const { locales } = resolveLocales(['zh-Hans'], 'ko', { 'zh-Hans': { unityLocaleCode: 'zh-CN', columnName: '' } }, null)
    expect(locales[0]).toMatchObject({ unityLocaleCode: 'zh-CN', codeOrigin: 'setting', columnName: 'Chinese (Simplified)(zh-CN)' })
    const named = resolveLocales(['en'], 'ko', { en: { unityLocaleCode: '', columnName: 'EN text' } }, null)
    expect(named.locales[0]).toMatchObject({ columnName: 'EN text', nameOrigin: 'setting' })
  })

  it('Unity 를 연결하면 맞는 로케일 코드를 쓰고, 없으면 경고한다', () => {
    const unity = [{ code: 'en-US', name: 'English (United States) (en-US)' }]
    const { locales, warnings } = resolveLocales(['en', 'ja'], 'ko', {}, unity)
    expect(locales[0]).toMatchObject({ unityLocaleCode: 'en-US', codeOrigin: 'unity', columnName: 'English (United States)(en-US)' })
    expect(locales[0]?.unityLocale?.code).toBe('en-US')
    expect(locales[1]).toMatchObject({ unityLocaleCode: 'ja', codeOrigin: 'project', unityLocale: null })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('ja')
  })
})
