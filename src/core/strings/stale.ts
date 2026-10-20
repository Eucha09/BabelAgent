import type { TranslationRow } from '@shared/schema/strings'

export type StaleResult = {
  rows: TranslationRow[]
  /** 이번에 stale로 바뀐 키. */
  markedKeys: string[]
  /** 원문에 없는 키(고아 행). 지우지 않고 보고만 한다. */
  orphanKeys: string[]
}

/**
 * 원문 해시가 달라진 번역을 stale로 표시한다.
 * 번역문은 지우지 않는다 — 사용자가 옛 번역과 새 원문을 비교해야 한다.
 * 비어 있는 번역은 무효가 될 내용이 없으므로 해시만 새 원문에 맞춘다.
 * stale 행의 source_hash 는 일부러 두는데, 그 번역이 어느 원문을 보고 쓴 것인지가 남아야 하기 때문이다.
 */
export function applyStale(
  rows: readonly TranslationRow[],
  masterHashByKey: ReadonlyMap<string, string>
): StaleResult {
  const markedKeys: string[] = []
  const orphanKeys: string[] = []

  const next = rows.map((row) => {
    const masterHash = masterHashByKey.get(row.key)
    if (masterHash === undefined) {
      orphanKeys.push(row.key)
      return row
    }
    if (masterHash === row.source_hash) return row

    if (row.text.trim() === '') {
      return { ...row, source_hash: masterHash, status: 'untranslated' as const }
    }
    if (row.status === 'stale') return row

    markedKeys.push(row.key)
    return { ...row, status: 'stale' as const }
  })

  return { rows: next, markedKeys, orphanKeys }
}
