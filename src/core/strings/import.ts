import type { ColumnMapping, ImportSummary, MasterRow } from '@shared/schema/strings'
import { sourceHash } from '../hash'

export type ImportResult = {
  rows: MasterRow[]
  summary: Omit<ImportSummary, 'staleMarked'>
}

const CANDIDATES: Record<keyof ColumnMapping, readonly string[]> = {
  key: ['key', 'id', 'string_id', 'stringid', '키'],
  source: ['source', 'source_text', 'original', '원문', 'text', 'string'],
  context: ['context', 'description', 'comment', 'note', '설명', '상황'],
  ui_type: ['ui_type', 'uitype', 'type', 'ui', '화면', '유형'],
  max_len: ['max_len', 'maxlen', 'max_length', 'length', '길이', '제한'],
  vars: ['vars', 'variables', 'params', '변수'],
  smart: ['smart', 'is_smart', 'issmart', 'smart_string'],
  tags: ['tags', 'tag', 'category', '태그', '분류']
}

/** 열 이름으로 매핑을 추측한다. 틀려도 사용자가 고칠 수 있으므로 과감하게 맞춰 본다. */
export function guessMapping(header: readonly string[]): ColumnMapping {
  const pick = (field: keyof ColumnMapping): string => {
    const names = CANDIDATES[field]
    const found = header.find((column) => names.includes(column.trim().toLowerCase()))
    return found ?? ''
  }
  return {
    key: pick('key'),
    source: pick('source'),
    context: pick('context'),
    ui_type: pick('ui_type'),
    max_len: pick('max_len'),
    vars: pick('vars'),
    smart: pick('smart'),
    tags: pick('tags')
  }
}

const OPTIONAL_FIELDS = ['context', 'ui_type', 'max_len', 'vars', 'smart', 'tags'] as const

/**
 * 가져온 레코드를 기존 원문에 합친다.
 * 매핑하지 않은 열은 기존 값을 그대로 둔다 — 이번 파일에 없는 정보를 지우지 않기 위해서다.
 * 이번 파일에 없는 키는 지우지 않고 목록으로만 보고한다.
 */
export function importMaster(
  existing: readonly MasterRow[],
  incoming: readonly Record<string, string>[],
  mapping: ColumnMapping
): ImportResult {
  const byKey = new Map(existing.map((row) => [row.key, row]))
  const result = new Map(existing.map((row) => [row.key, row]))

  const seen = new Set<string>()
  const duplicates: string[] = []
  let added = 0
  let changed = 0
  let unchanged = 0
  let emptyKeys = 0

  for (const record of incoming) {
    const key = (record[mapping.key] ?? '').trim()
    if (key === '') {
      emptyKeys += 1
      continue
    }
    if (seen.has(key)) {
      duplicates.push(key)
      continue
    }
    seen.add(key)

    const source = record[mapping.source] ?? ''
    const previous = byKey.get(key)
    const base: MasterRow = previous ?? {
      key,
      source: '',
      context: '',
      ui_type: '',
      max_len: '',
      vars: '',
      smart: '',
      tags: '',
      source_hash: ''
    }

    const next: MasterRow = { ...base, key, source, source_hash: sourceHash(source) }
    for (const field of OPTIONAL_FIELDS) {
      const column = mapping[field]
      if (column !== '') next[field] = record[column] ?? ''
    }

    if (!previous) added += 1
    else if (previous.source !== source) changed += 1
    else unchanged += 1

    result.set(key, next)
  }

  const missing = existing.filter((row) => !seen.has(row.key)).map((row) => row.key)

  return {
    rows: [...result.values()],
    summary: { added, changed, unchanged, missing, duplicates, emptyKeys }
  }
}
