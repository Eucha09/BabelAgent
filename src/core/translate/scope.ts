import type { TranslateScope } from '@shared/schema/jobs'
import type { MasterRow, TranslationRow } from '@shared/schema/strings'

export type { TranslateScope }

export type ScopeResult = {
  rows: MasterRow[]
  /** 범위에는 들었지만 approved 라서 뺀 키. 화면에 알려 준다. */
  skippedApproved: string[]
}

/**
 * 범위에 맞는 원문 행을 원문 순서대로 고른다.
 * approved 행은 사용자의 명시적 조작 없이 덮어쓰지 않으므로 항상 뺀다.
 */
export function selectRows(
  master: readonly MasterRow[],
  translations: readonly TranslationRow[],
  scope: TranslateScope,
  selectedKeys: ReadonlySet<string> = new Set()
): ScopeResult {
  const byKey = new Map(translations.map((row) => [row.key, row]))
  const rows: MasterRow[] = []
  const skippedApproved: string[] = []

  for (const row of master) {
    const translation = byKey.get(row.key)
    const status = translation?.status ?? 'untranslated'
    const empty = (translation?.text ?? '').trim() === ''

    const inScope =
      scope === 'all' ||
      (scope === 'untranslated' && (status === 'untranslated' || empty)) ||
      (scope === 'stale' && status === 'stale') ||
      (scope === 'selected' && selectedKeys.has(row.key))
    if (!inScope) continue

    if (status === 'approved') {
      skippedApproved.push(row.key)
      continue
    }
    rows.push(row)
  }

  return { rows, skippedApproved }
}
