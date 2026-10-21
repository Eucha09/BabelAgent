import type { TranslationRow } from '@shared/schema/strings'
import type { SubmittedTranslation } from './submission'

export type MergeResult = {
  rows: TranslationRow[]
  written: string[]
  /** approved 라서 덮어쓰지 않은 키. 배치에 넣지 않으므로 정상이라면 비어 있다. */
  skippedApproved: string[]
}

/**
 * 검증을 통과한 배치를 번역 행에 합친다. 기록된 행은 draft 가 되고 지금 원문의 해시를 단다.
 * approved 는 여기서도 한 번 더 막는다 — 배치를 고르는 쪽의 실수가 승인된 번역을 덮지 않게.
 */
export function mergeTranslations(
  existing: readonly TranslationRow[],
  submitted: readonly SubmittedTranslation[],
  hashByKey: ReadonlyMap<string, string>
): MergeResult {
  const rows = [...existing]
  const indexByKey = new Map(rows.map((row, index) => [row.key, index]))
  const written: string[] = []
  const skippedApproved: string[] = []

  for (const item of submitted) {
    const index = indexByKey.get(item.key)
    const previous = index === undefined ? undefined : rows[index]
    if (previous?.status === 'approved') {
      skippedApproved.push(item.key)
      continue
    }

    const next: TranslationRow = {
      key: item.key,
      text: item.text,
      source_hash: hashByKey.get(item.key) ?? previous?.source_hash ?? '',
      status: 'draft',
      confidence: String(Math.round(item.confidence * 100) / 100),
      note: item.note ?? ''
    }
    if (index === undefined) {
      indexByKey.set(item.key, rows.length)
      rows.push(next)
    } else {
      rows[index] = next
    }
    written.push(item.key)
  }

  return { rows, written, skippedApproved }
}
