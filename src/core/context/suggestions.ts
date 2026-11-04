import {
  CONTEXT_FIELDS,
  SUGGESTION_COLUMNS,
  type ApplyContextItem,
  type ApplyContextResult,
  type ContextField,
  type ContextSuggestion
} from '@shared/schema/context'
import type { MasterRow } from '@shared/schema/strings'
import { parseVarsMeta } from '../qa/vars'
import type { Messages } from '@shared/i18n'

/** context_suggestions.csv 레코드를 제안 행으로. 키가 겹치면 뒤의 행(나중 제안)을 쓴다. */
export function toSuggestions(records: readonly Readonly<Record<string, string>>[]): ContextSuggestion[] {
  const byKey = new Map<string, ContextSuggestion>()
  for (const record of records) {
    const key = (record['key'] ?? '').trim()
    if (key === '') continue
    const row: ContextSuggestion = {
      key,
      source_hash: record['source_hash'] ?? '',
      context: record['context'] ?? '',
      ui_type: record['ui_type'] ?? '',
      max_len: record['max_len'] ?? '',
      vars: record['vars'] ?? '',
      confidence: record['confidence'] ?? '',
      note: record['note'] ?? ''
    }
    byKey.delete(key)
    byKey.set(key, row)
  }
  return [...byKey.values()]
}

export function suggestionsToRecords(rows: readonly ContextSuggestion[]): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {}
    for (const name of SUGGESTION_COLUMNS) record[name] = row[name]
    return record
  })
}

/** 새 제안을 합친다. 같은 키는 그 자리에서 새 제안으로 바꾸고, 새 키는 뒤에 붙인다. */
export function mergeSuggestions(
  existing: readonly ContextSuggestion[],
  incoming: readonly ContextSuggestion[]
): ContextSuggestion[] {
  const next = [...existing]
  const indexByKey = new Map(next.map((row, index) => [row.key, index]))
  for (const row of incoming) {
    const index = indexByKey.get(row.key)
    if (index === undefined) {
      indexByKey.set(row.key, next.length)
      next.push(row)
    } else {
      next[index] = row
    }
  }
  return next
}

export function removeSuggestions(existing: readonly ContextSuggestion[], keys: readonly string[]): ContextSuggestion[] {
  const drop = new Set(keys)
  return existing.filter((row) => !drop.has(row.key))
}

/**
 * 원문 열에 쓸 값인지. 빈 값은 "적용하지 않음"이라 통과한다.
 * max_len 은 양의 정수, vars 는 vars 열 형식(JSON 배열)이어야 한다.
 */
export function fieldValueProblem(field: ContextField, value: string, t: Messages): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (field === 'max_len' && !/^[1-9]\d*$/.test(trimmed)) return t.contextCheck.maxLenInteger
  if (field === 'vars') {
    const parsed = parseVarsMeta(trimmed)
    if (!parsed.ok) return t.contextCheck.varsInvalid(parsed.reason)
  }
  return null
}

export type ApplySuggestionsResult = ApplyContextResult & { rows: MasterRow[] }

/**
 * 사람이 승인한 제안을 원문 행에 넣는다. 순수 함수 — 저장은 호출한 쪽이 한다.
 * - 빈 값은 적용하지 않는다(사람이 그 필드를 지운 것)
 * - 화면이 본 뒤 원문 행의 그 칸이 바뀌었으면 행 전체를 건너뛴다. 사람이 쓴 값을 덮지 않는다
 * - 원문 텍스트·키·해시는 건드리지 않는다. 메타데이터는 stale 을 일으키지 않는다
 */
export function applySuggestionValues(
  rows: readonly MasterRow[],
  items: readonly ApplyContextItem[],
  t: Messages
): ApplySuggestionsResult {
  const next = [...rows]
  const indexByKey = new Map(next.map((row, index) => [row.key, index]))
  const applied: string[] = []
  const skipped: ApplyContextResult['skipped'] = []

  for (const item of items) {
    const index = indexByKey.get(item.key)
    const row = index === undefined ? undefined : next[index]
    if (index === undefined || !row) {
      skipped.push({ key: item.key, reason: 'missing' })
      continue
    }
    const fields = CONTEXT_FIELDS.filter((field) => (item.values[field] ?? '').trim() !== '')
    if (fields.length === 0) {
      skipped.push({ key: item.key, reason: 'empty' })
      continue
    }
    const changed = fields.filter((field) => row[field] !== (item.expected[field] ?? ''))
    if (changed.length > 0) {
      skipped.push({ key: item.key, reason: 'changed', detail: changed.join(', ') })
      continue
    }
    const problems = fields.flatMap((field) => {
      const problem = fieldValueProblem(field, item.values[field] ?? '', t)
      return problem ? [problem] : []
    })
    if (problems.length > 0) {
      skipped.push({ key: item.key, reason: 'invalid', detail: problems.join(' ') })
      continue
    }
    const updated: MasterRow = { ...row }
    for (const field of fields) updated[field] = (item.values[field] ?? '').trim()
    next[index] = updated
    applied.push(item.key)
  }
  return { rows: next, applied, skipped }
}
