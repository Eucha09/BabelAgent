import { unityEnglishName } from '../export/locales'
import { UNITY_ENGLISH_NAMES } from '../export/unity-locale-names'
import { isLanguageTag } from './settings'

/** 게임 현지화에서 자주 쓰는 언어. 고르는 목록의 맨 위에 둔다. */
export const COMMON_LANGUAGES: readonly string[] = [
  'ko',
  'en',
  'ja',
  'zh-Hans',
  'zh-Hant',
  'fr',
  'de',
  'es',
  'es-419',
  'pt-BR',
  'pt-PT',
  'it',
  'ru',
  'pl',
  'tr',
  'uk',
  'th',
  'vi',
  'id',
  'ms',
  'ar',
  'nl',
  'sv',
  'cs',
  'hu'
]

export type LanguageOption = {
  code: string
  /** 한국어 이름. 모르면 빈 글자 */
  name: string
  /** 영어 이름(Unity 이름표 → CLDR). 모르면 빈 글자 */
  englishName: string
  common: boolean
}

const koreanNames = new Intl.DisplayNames(['ko'], { type: 'language' })
const englishNames = new Intl.DisplayNames(['en'], { type: 'language' })

function displayName(names: Intl.DisplayNames, code: string): string {
  if (!isLanguageTag(code)) return ''
  try {
    const name = names.of(code)
    return name && name !== code ? name : ''
  } catch {
    return ''
  }
}

/** 언어 코드 옆에 붙일 한국어 이름. 모르는 코드면 빈 글자. */
export function koreanLanguageName(code: string): string {
  return displayName(koreanNames, code)
}

/** 언어 코드 옆에 붙일 영어 이름. Unity 이름표를 먼저 보고, 없으면 CLDR. 모르는 코드면 빈 글자. */
export function englishLanguageName(code: string): string {
  return unityEnglishName(code) ?? displayName(englishNames, code)
}

function option(code: string, common: boolean): LanguageOption {
  return {
    code,
    name: koreanLanguageName(code),
    englishName: englishLanguageName(code),
    common
  }
}

/**
 * 고를 수 있는 언어: 자주 쓰는 언어(위 순서) → Unity(Mono) 문화권 코드(코드 순).
 * 옛 별칭(`zh-CHS`·`zh-CHT`, 이름이 "… Legacy")은 뺀다 — 같은 언어를 두 번 보여 준다.
 */
export function buildLanguageOptions(): LanguageOption[] {
  const common = new Set(COMMON_LANGUAGES.map((code) => code.toLowerCase()))
  const rest = Object.entries(UNITY_ENGLISH_NAMES)
    .filter(([code, name]) => !common.has(code.toLowerCase()) && !name.endsWith('Legacy') && isLanguageTag(code))
    .map(([code]) => code)
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0))
  return [...COMMON_LANGUAGES.map((code) => option(code, true)), ...rest.map((code) => option(code, false))]
}

/**
 * 검색어로 거른다. 코드·한국어 이름·영어 이름에서 찾고(대소문자 무시), 코드가 똑같은 것 → 코드가 검색어로
 * 시작하는 것 → 나머지 순으로 둔다. exclude 의 코드(이미 고른 언어 등)는 뺀다.
 */
export function filterLanguageOptions(
  options: readonly LanguageOption[],
  query: string,
  exclude: ReadonlySet<string> = new Set()
): LanguageOption[] {
  const excluded = new Set([...exclude].map((code) => code.toLowerCase()))
  const available = options.filter((item) => !excluded.has(item.code.toLowerCase()))
  const needle = query.trim().toLowerCase()
  if (needle === '') return available

  const rank = (item: LanguageOption): number => {
    const code = item.code.toLowerCase()
    if (code === needle) return 0
    if (code.startsWith(needle)) return 1
    if (item.name.toLowerCase().includes(needle) || item.englishName.toLowerCase().includes(needle)) return 2
    if (code.includes(needle)) return 3
    return -1
  }
  return available
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item)
}

/**
 * 목록에 없는 코드를 직접 넣을 때의 후보. 검색어가 BCP 47 태그이고 목록·exclude 에 없을 때만,
 * 표준 표기로 바꿔 돌려준다(`pt-br` → `pt-BR`).
 */
export function customLanguageCode(
  options: readonly LanguageOption[],
  query: string,
  exclude: ReadonlySet<string> = new Set()
): string | null {
  const trimmed = query.trim()
  if (!isLanguageTag(trimmed)) return null
  const canonical = Intl.getCanonicalLocales(trimmed)[0] ?? trimmed
  const lower = canonical.toLowerCase()
  if (options.some((item) => item.code.toLowerCase() === lower)) return null
  if ([...exclude].some((code) => code.toLowerCase() === lower)) return null
  return canonical
}
