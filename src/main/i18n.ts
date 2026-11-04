import { messagesFor, type Messages, type UiLanguage } from '@shared/i18n'

/**
 * 메인이 만드는 문구(오류·작업 로그·파일 선택 창 제목)의 언어. 앱이 켜질 때 앱 설정(없으면 OS 표시 언어)으로 정하고,
 * 설정 화면에서 바꾸면 따라 바꾼다. 이미 남긴 로그는 그때 언어로 남는다.
 * Electron 에 기대지 않는다 — 파일·프로젝트 모듈은 Electron 없이 단위 테스트로 돈다(정하기 전에는 한국어).
 */
let current: UiLanguage = 'ko'

export function setUiLanguage(language: UiLanguage): void {
  current = language
}

export function uiLanguage(): UiLanguage {
  return current
}

/** 지금 화면 언어의 문구 카탈로그 */
export function msg(): Messages {
  return messagesFor(current)
}
