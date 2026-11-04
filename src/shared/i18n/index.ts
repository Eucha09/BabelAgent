import { en } from './en'
import { ko, type Messages } from './ko'
import type { UiLanguage } from './languages'

export type { Messages } from './ko'
export * from './languages'

const CATALOGS: Readonly<Record<UiLanguage, Messages>> = { ko, en }

/** 화면 언어의 문구 카탈로그. 렌더러·메인·core 가 같은 카탈로그를 쓴다. */
export function messagesFor(language: UiLanguage): Messages {
  return CATALOGS[language]
}
