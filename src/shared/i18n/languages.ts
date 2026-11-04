/**
 * 앱 화면 언어. 순서는 설정 화면의 선택지 순서다.
 * 의존성 없이 둔다 — sandbox preload 는 외부 모듈을 불러오지 못하는데 처음 언어를 여기서 읽는다.
 */
export const UI_LANGUAGES = ['ko', 'en'] as const
export type UiLanguage = (typeof UI_LANGUAGES)[number]

/** 선택지 이름. 지금 화면 언어와 상관없이 그 언어로 적는다 — 읽지 못하는 언어로 바꿔도 되돌릴 수 있게 */
export const UI_LANGUAGE_NAME: Readonly<Record<UiLanguage, string>> = { ko: '한국어', en: 'English' }

/** 날짜·시간·숫자 형식에 쓰는 로캘 */
export const UI_LOCALE: Readonly<Record<UiLanguage, string>> = { ko: 'ko-KR', en: 'en-US' }

/** 메인이 창을 만들 때 처음 화면 언어를 넘기는 인자. preload 가 process.argv 에서 읽는다 */
export const UI_LANGUAGE_ARG = '--babel-ui-language='

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === 'string' && (UI_LANGUAGES as readonly string[]).includes(value)
}

/**
 * 화면 언어를 정한다. 설정에서 고른 값이 있으면 그것, 없으면 OS 표시 언어를 따른다 —
 * 첫 번째 선호 언어가 한국어면 한국어, 그 밖에는 영어.
 */
export function resolveUiLanguage(setting: UiLanguage | null, systemLanguages: readonly string[]): UiLanguage {
  if (setting) return setting
  const first = systemLanguages[0]?.trim().toLowerCase() ?? ''
  return first === 'ko' || first.startsWith('ko-') ? 'ko' : 'en'
}
