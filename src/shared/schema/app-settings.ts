import { z } from 'zod'

/**
 * 인증 모드. 지금은 PC에 로그인된 Claude Code 계정만 쓴다.
 * 'api-key'는 추후 배포용 자리이며 M1에서는 선택할 수 없다.
 */
export const AuthMode = z.enum(['claude-code', 'api-key'])
export type AuthMode = z.infer<typeof AuthMode>

const AuthSettings = z.object({ mode: AuthMode })
const DEFAULT_AUTH: z.infer<typeof AuthSettings> = { mode: 'claude-code' }

export const AppSettings = z.object({
  /** null이면 SDK 기본 탐색에 맡긴다. 패키징 후 경로가 달라질 때 수동 지정용. */
  cliPath: z.string().nullable().default(null),
  /** null이면 CLAUDE_CONFIG_DIR 환경변수, 그것도 없으면 ~/.claude를 쓴다. */
  claudeConfigDir: z.string().nullable().default(null),
  auth: AuthSettings.default(DEFAULT_AUTH),
  /** 다크 테마 한 벌만 지원한다. 확장 자리. */
  theme: z.literal('dark').default('dark'),
  lastProjectDir: z.string().nullable().default(null)
})
export type AppSettings = z.infer<typeof AppSettings>

export const DEFAULT_APP_SETTINGS: AppSettings = {
  cliPath: null,
  claudeConfigDir: null,
  auth: { ...DEFAULT_AUTH },
  theme: 'dark',
  lastProjectDir: null
}

/** 설정 부분 갱신. 렌더러에서 바꿀 수 있는 항목만 받는다. */
export const AppSettingsPatch = z
  .object({
    cliPath: z.string().nullable(),
    claudeConfigDir: z.string().nullable(),
    lastProjectDir: z.string().nullable()
  })
  .partial()
export type AppSettingsPatch = z.infer<typeof AppSettingsPatch>
