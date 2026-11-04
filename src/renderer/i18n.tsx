import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { UI_LOCALE, messagesFor, type Messages, type UiLanguage } from '@shared/i18n'

type I18n = {
  language: UiLanguage
  /** 날짜·시간·숫자 형식에 넘기는 로캘(예: ko-KR) */
  locale: string
  t: Messages
}

const I18nContext = createContext<I18n | null>(null)

/** 화면 언어를 내려 준다. 언어는 App 이 앱 설정(없으면 preload 가 받은 처음 언어)으로 정한다. */
export function I18nProvider({ language, children }: { language: UiLanguage; children: ReactNode }): React.JSX.Element {
  const value = useMemo<I18n>(() => ({ language, locale: UI_LOCALE[language], t: messagesFor(language) }), [language])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}

/** 지금 화면 언어의 문구 카탈로그 */
export function useT(): Messages {
  return useI18n().t
}
