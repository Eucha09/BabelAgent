import type { ExportLanguageView, ExportLocale, UnityLocaleInfo } from '@shared/schema/export'
import { UNITY_ENGLISH_NAMES } from './unity-locale-names'
import type { Messages } from '@shared/i18n'

const NAMES_BY_LOWER: ReadonlyMap<string, string> = new Map(
  Object.entries(UNITY_ENGLISH_NAMES).map(([code, name]) => [code.toLowerCase(), name])
)

/**
 * Unity(Mono)의 CultureInfo.GetCultureInfo(code).EnglishName 을 흉내 낸다.
 * 표에 없으면 마지막 하위 태그를 떼어 가며 다시 찾는다(`es-419` → `es`). 끝내 없으면 null — Unity 는 `Custom` 을 쓴다.
 */
export function unityEnglishName(code: string): string | null {
  let current = code.trim().toLowerCase().replace(/_/g, '-')
  while (current !== '') {
    const name = NAMES_BY_LOWER.get(current)
    if (name !== undefined) return name
    const cut = current.lastIndexOf('-')
    if (cut === -1) return null
    current = current.slice(0, cut)
  }
  return null
}

/** Unity CSV 확장의 기본 로케일 열 이름: LocaleIdentifier.ToString() = `{EnglishName}({코드})`. */
export function defaultColumnName(code: string): string {
  return `${unityEnglishName(code) ?? 'Custom'}(${code})`
}

const baseLanguage = (code: string): string => (code.toLowerCase().split(/[-_]/)[0] ?? '').trim()

/**
 * 프로젝트 언어에 맞는 Unity 로케일. 대소문자 무시 일치 → 기본 언어가 같은 로케일이 하나뿐이면 그것.
 * 둘 이상이면(`zh-Hans`·`zh-Hant`) 추측하지 않는다.
 */
export function matchUnityLocale(code: string, locales: readonly UnityLocaleInfo[]): UnityLocaleInfo | null {
  const lower = code.toLowerCase()
  const exact = locales.find((locale) => locale.code.toLowerCase() === lower)
  if (exact) return exact
  const base = baseLanguage(code)
  const sameBase = locales.filter((locale) => baseLanguage(locale.code) === base)
  return sameBase.length === 1 ? (sameBase[0] ?? null) : null
}

export type ResolvedLocales = { locales: ExportLanguageView[]; warnings: string[] }

/**
 * 내보낼 언어마다 Unity 로케일 코드와 열 이름을 정한다.
 * 코드: 설정값 → 연결한 Unity 의 맞는 로케일 → 프로젝트 언어 코드. 열 이름: 설정값 → 코드로 만든 기본 이름.
 * unityLocales 가 null 이면 Unity 를 연결하지 않았거나 읽지 못한 것이다.
 */
export function resolveLocales(
  languages: readonly string[],
  sourceLanguage: string,
  settings: Readonly<Record<string, ExportLocale>>,
  unityLocales: readonly UnityLocaleInfo[] | null,
  t: Messages
): ResolvedLocales {
  const warnings: string[] = []
  const locales = languages.map((language): ExportLanguageView => {
    const setting = settings[language]
    const setCode = setting?.unityLocaleCode.trim() ?? ''
    const setName = setting?.columnName.trim() ?? ''
    const matched = unityLocales ? matchUnityLocale(setCode !== '' ? setCode : language, unityLocales) : null

    let unityLocaleCode = language
    let codeOrigin: ExportLanguageView['codeOrigin'] = 'project'
    if (setCode !== '') {
      unityLocaleCode = setCode
      codeOrigin = 'setting'
    } else if (matched) {
      unityLocaleCode = matched.code
      codeOrigin = 'unity'
    }

    // 설정한 코드는 대소문자까지 같아야 맞는 것으로 본다(열 이름에 그 표기가 들어간다)
    const unityLocale =
      unityLocales?.find((locale) => locale.code.toLowerCase() === unityLocaleCode.toLowerCase()) ?? null
    if (unityLocales && !unityLocale) {
      warnings.push(t.exportCheck.missingUnityLocale(unityLocaleCode, language))
    }

    return {
      language,
      isSource: language === sourceLanguage,
      unityLocaleCode,
      codeOrigin,
      columnName: setName !== '' ? setName : defaultColumnName(unityLocaleCode),
      nameOrigin: setName !== '' ? 'setting' : 'auto',
      unityLocale
    }
  })
  return { locales, warnings }
}
