import { z } from 'zod'

const UsageScope = z
  .object({
    model: z.object({ display_name: z.string() }).nullish(),
    surface: z.object({ display_name: z.string() }).nullish()
  })
  .nullish()

/**
 * 서버가 내려주는 사용량 미터 한 줄.
 * 어떤 미터가 오는지는 서버가 정하므로 kind를 열거형으로 좁히지 않는다.
 */
export const UsageLimitRow = z.object({
  kind: z.string(),
  group: z.string(),
  /** 사용한 비율 0~100. */
  percent: z.number(),
  /** ISO 8601. 초기화 시각을 모르면 null. */
  resets_at: z.string().nullable(),
  severity: z.string(),
  /** 서버가 고른 대표 행. */
  is_active: z.boolean(),
  scope: UsageScope
})
export type UsageLimitRow = z.infer<typeof UsageLimitRow>

export const UsageLimits = z.object({
  limits: z.array(UsageLimitRow),
  /** 조회 시각(ISO). 화면에 "방금 확인함"을 보여주는 용도. */
  fetchedAt: z.string()
})
export type UsageLimits = z.infer<typeof UsageLimits>
