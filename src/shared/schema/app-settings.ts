import { z } from 'zod'
import { UI_LANGUAGES } from '../i18n/languages'

export const UiLanguageSchema = z.enum(UI_LANGUAGES)

export const AppSettings = z.object({
  /** null이면 SDK 기본 탐색에 맡긴다. 패키징 후 경로가 달라질 때 수동 지정용. */
  cliPath: z.string().nullable().default(null),
  /** null이면 CLAUDE_CONFIG_DIR 환경변수, 그것도 없으면 ~/.claude를 쓴다. */
  claudeConfigDir: z.string().nullable().default(null),
  /** 다크 테마 한 벌만 지원한다. 확장 자리. */
  theme: z.literal('dark').default('dark'),
  lastProjectDir: z.string().nullable().default(null),
  /** 화면 언어. null이면 고른 적이 없어 OS 표시 언어를 따른다(`resolveUiLanguage`). */
  uiLanguage: UiLanguageSchema.nullable().default(null)
})
export type AppSettings = z.infer<typeof AppSettings>

export const DEFAULT_APP_SETTINGS: AppSettings = {
  cliPath: null,
  claudeConfigDir: null,
  theme: 'dark',
  lastProjectDir: null,
  uiLanguage: null
}

/** 설정 부분 갱신. 렌더러에서 바꿀 수 있는 항목만 받는다. */
export const AppSettingsPatch = z
  .object({
    cliPath: z.string().nullable(),
    claudeConfigDir: z.string().nullable(),
    lastProjectDir: z.string().nullable(),
    uiLanguage: UiLanguageSchema
  })
  .partial()
export type AppSettingsPatch = z.infer<typeof AppSettingsPatch>
