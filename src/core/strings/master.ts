import {
  MASTER_COLUMNS,
  TRANSLATION_COLUMNS,
  type MasterRow,
  type TranslationRow
} from '@shared/schema/strings'
import type { TranslationStatus } from '@shared/schema/project'
import { sourceHash } from '../hash'

const STATUSES: readonly TranslationStatus[] = [
  'untranslated',
  'draft',
  'review',
  'approved',
  'stale'
]

export type MasterParseResult = {
  rows: MasterRow[]
  /** 중복된 키. 첫 행만 남긴다. */
  duplicateKeys: string[]
  emptyKeyRows: number
  /** 없어서 읽을 수 없는 필수 열. */
  missingColumns: string[]
  /** source_hash가 비었거나 원문과 맞지 않아 다시 계산한 키. */
  rehashedKeys: string[]
}

/** 레코드를 strings_master 행으로 바꾼다. 해시가 맞지 않으면 다시 계산한다. */
export function toMasterRows(
  records: readonly Record<string, string>[],
  header: readonly string[]
): MasterParseResult {
  const missingColumns = ['key', 'source'].filter((name) => !header.includes(name))
  if (missingColumns.length > 0) {
    return { rows: [], duplicateKeys: [], emptyKeyRows: 0, missingColumns, rehashedKeys: [] }
  }

  const rows: MasterRow[] = []
  const seen = new Set<string>()
  const duplicateKeys: string[] = []
  const rehashedKeys: string[] = []
  let emptyKeyRows = 0

  for (const record of records) {
    const key = (record['key'] ?? '').trim()
    if (key === '') {
      emptyKeyRows += 1
      continue
    }
    if (seen.has(key)) {
      duplicateKeys.push(key)
      continue
    }
    seen.add(key)

    const source = record['source'] ?? ''
    const expected = sourceHash(source)
    const stored = record['source_hash'] ?? ''
    if (stored !== expected) rehashedKeys.push(key)

    rows.push({
      key,
      source,
      context: record['context'] ?? '',
      ui_type: record['ui_type'] ?? '',
      max_len: record['max_len'] ?? '',
      vars: record['vars'] ?? '',
      tags: record['tags'] ?? '',
      source_hash: expected
    })
  }

  return { rows, duplicateKeys, emptyKeyRows, missingColumns: [], rehashedKeys }
}

export function masterToRecords(rows: readonly MasterRow[]): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {}
    for (const name of MASTER_COLUMNS) record[name] = row[name]
    return record
  })
}

/** 원문이 바뀐 행의 해시를 다시 맞춘다. */
export function rehash(row: MasterRow): MasterRow {
  return { ...row, source_hash: sourceHash(row.source) }
}

export type TranslationParseResult = {
  rows: TranslationRow[]
  duplicateKeys: string[]
  /** 알 수 없는 상태값이라 코드가 다시 정한 키. */
  repairedKeys: string[]
}

export function toTranslationRows(
  records: readonly Record<string, string>[]
): TranslationParseResult {
  const rows: TranslationRow[] = []
  const seen = new Set<string>()
  const duplicateKeys: string[] = []
  const repairedKeys: string[] = []

  for (const record of records) {
    const key = (record['key'] ?? '').trim()
    if (key === '') continue
    if (seen.has(key)) {
      duplicateKeys.push(key)
      continue
    }
    seen.add(key)

    const text = record['text'] ?? ''
    const raw = record['status'] ?? ''
    const known = STATUSES.find((status) => status === raw)
    if (!known) repairedKeys.push(key)
    // 모르는 상태값은 버리되 번역문이 있으면 초안으로 살려 둔다.
    const status: TranslationStatus = known ?? (text.trim() === '' ? 'untranslated' : 'draft')

    rows.push({
      key,
      text,
      source_hash: record['source_hash'] ?? '',
      status,
      confidence: record['confidence'] ?? '',
      note: record['note'] ?? ''
    })
  }

  return { rows, duplicateKeys, repairedKeys }
}

export function translationToRecords(rows: readonly TranslationRow[]): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {}
    for (const name of TRANSLATION_COLUMNS) record[name] = row[name]
    return record
  })
}
