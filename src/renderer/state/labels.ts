import type { Messages } from '@shared/i18n'
import { TranslationStatus } from '@shared/schema/project'

/** 번역 상태 이름. CSV 에서 읽은 모르는 값은 그대로 보여 준다 */
export function statusLabel(status: string, t: Messages): string {
  const parsed = TranslationStatus.safeParse(status)
  return parsed.success ? t.status[parsed.data] : status
}
