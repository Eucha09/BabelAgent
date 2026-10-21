import type { TranslationRow } from '@shared/schema/strings'
import type { SubmittedTranslation } from './submission'

export type MergeResult = {
  rows: TranslationRow[]
  written: string[]
  /** approved 라서 덮어쓰지 않은 키. 배치에 넣지 않으므로 정상이라면 비어 있다. */
  skippedApproved: string[]
  /** 작업이 시작된 뒤 사용자가 고친 키. 사람의 편집을 배치 결과로 덮지 않는다. */
  skippedChanged: string[]
}

/** 기록할 때 쓰는 현재 원문. 해시와 함께 그 원문을 번역 행에 남긴다. */
export type MasterSource = { source: string; source_hash: string }

/**
 * 행이 바뀌었는지 비교하는 지문. 작업을 시작할 때와 기록할 때 같은 함수로 만든다.
 * 행이 없으면 빈 문자열이다.
 */
export function rowFingerprint(row: Pick<TranslationRow, 'text' | 'status'> | undefined): string {
  return row ? `${row.status}\u0000${row.text}` : ''
}

/**
 * 검증을 통과한 배치를 번역 행에 합친다. 기록된 행은 draft 가 되고 지금 원문의 해시와 원문 자체를 단다.
 * approved 는 여기서도 한 번 더 막는다 — 배치를 고르는 쪽의 실수가 승인된 번역을 덮지 않게.
 * baseline 이 있으면 작업 시작 때와 달라진 행도 건너뛴다 — 검토 화면에서 고친 행을 지키기 위해서다.
 */
export function mergeTranslations(
  existing: readonly TranslationRow[],
  submitted: readonly SubmittedTranslation[],
  masterByKey: ReadonlyMap<string, MasterSource>,
  baseline?: ReadonlyMap<string, string>
): MergeResult {
  const rows = [...existing]
  const indexByKey = new Map(rows.map((row, index) => [row.key, index]))
  const written: string[] = []
  const skippedApproved: string[] = []
  const skippedChanged: string[] = []

  for (const item of submitted) {
    const index = indexByKey.get(item.key)
    const previous = index === undefined ? undefined : rows[index]
    if (previous?.status === 'approved') {
      skippedApproved.push(item.key)
      continue
    }
    const expected = baseline?.get(item.key)
    if (expected !== undefined && expected !== rowFingerprint(previous)) {
      skippedChanged.push(item.key)
      continue
    }

    const master = masterByKey.get(item.key)
    const next: TranslationRow = {
      key: item.key,
      text: item.text,
      source_hash: master?.source_hash ?? previous?.source_hash ?? '',
      status: 'draft',
      confidence: String(Math.round(item.confidence * 100) / 100),
      note: item.note ?? '',
      source_snapshot: master?.source ?? previous?.source_snapshot ?? ''
    }
    if (index === undefined) {
      indexByKey.set(item.key, rows.length)
      rows.push(next)
    } else {
      rows[index] = next
    }
    written.push(item.key)
  }

  return { rows, written, skippedApproved, skippedChanged }
}
