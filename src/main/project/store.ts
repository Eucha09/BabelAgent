import { basename, join } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { fromRecords, parseCsvTable, stringifyCsvTable, toRecords } from '@core/csv/codec'
import {
  masterToRecords,
  rehash,
  toMasterRows,
  toTranslationRows,
  translationToRecords
} from '@core/strings/master'
import { sourceHash } from '@core/hash'
import {
  applySuggestionValues,
  mergeSuggestions,
  removeSuggestions,
  suggestionsToRecords,
  toSuggestions
} from '@core/context/suggestions'
import {
  appendCandidates,
  applyGlossaryChanges,
  glossaryHeader,
  toGlossaryEntries,
  type GlossaryCandidate,
  type GlossaryChangeInput
} from '@core/glossary/entries'
import { hasErrors } from '@core/qa/check'
import { applyManualUpdate, type ManualUpdate } from '@core/status'
import { applyStale } from '@core/strings/stale'
import { parseGlossary, termsWithoutConfirmedTranslation, type GlossaryTerm } from '@core/translate/glossary'
import { fillTermTranslations, type TermTranslationResult } from '@core/terms/translation'
import { mergeTranslations, type MasterSource } from '@core/translate/merge'
import type { SubmittedTranslation } from '@core/translate/submission'
import {
  SUGGESTION_COLUMNS,
  type ApplyContextItem,
  type ApplyContextResult,
  type ContextSuggestion
} from '@shared/schema/context'
import type { GlossaryView, UpdateGlossaryResult } from '@shared/schema/glossary'
import type { TranslationStatus } from '@shared/schema/project'
import type { QaDiagnostic } from '@shared/schema/qa'
import type { BulkApproveResult, BulkApproveSkipReason } from '@shared/schema/review'
import {
  MASTER_COLUMNS,
  TRANSLATION_COLUMNS,
  type EncodingNotice,
  type MasterRow,
  type StringsRow,
  type TranslationRow
} from '@shared/schema/strings'
import { fail, ok, type IpcResult } from '@shared/types'
import { describeIoError } from '../fs'
import { diskHash, readTextFile, writeTextFile, type TextEncoding } from '../fs/text'

export const MASTER_FILE = 'strings_master.csv'

export function masterPath(dir: string): string {
  return join(dir, MASTER_FILE)
}

export function translationFile(language: string): string {
  return `translations_${language}.csv`
}

export function translationPath(dir: string, language: string): string {
  return join(dir, translationFile(language))
}

/** 파일을 읽은 시점의 내용 해시. 저장 직전 디스크와 비교해 충돌을 잡는다. */
const readHashes = new Map<string, string | null>()

export function forgetReadHashes(): void {
  readHashes.clear()
}

/** 감시자가 자기 쓰기와 외부 변경을 구분할 때 쓴다. */
export function isKnownContent(path: string): boolean {
  const expected = readHashes.get(path)
  if (expected === undefined) return false
  return expected === diskHash(path)
}

type LoadedCsv = {
  records: Record<string, string>[]
  header: string[]
  encoding: TextEncoding
}

function loadCsv(path: string): IpcResult<LoadedCsv | null> {
  if (!existsSync(path)) {
    readHashes.set(path, null)
    return ok(null)
  }
  try {
    const file = readTextFile(path)
    readHashes.set(path, file.hash)
    const table = parseCsvTable(file.text)
    return ok({ records: toRecords(table), header: table.header, encoding: file.encoding })
  } catch (error) {
    return fail('io', describeIoError(error, basename(path)))
  }
}

function checkConflict(path: string, force: boolean): IpcResult<null> {
  if (force) return ok(null)
  const expected = readHashes.get(path)
  const actual = diskHash(path)
  if (expected === undefined) {
    if (actual === null) return ok(null)
    return fail(
      'conflict',
      `${basename(path)} 파일이 이미 있습니다. 앱에서 읽지 않은 파일이라 덮어쓰기 전에 확인이 필요합니다.`
    )
  }
  if (expected !== actual) {
    return fail('conflict', `${basename(path)} 파일이 앱 밖에서 바뀌었습니다.`)
  }
  return ok(null)
}

function saveCsv(
  path: string,
  header: readonly string[],
  records: readonly Record<string, string>[],
  force: boolean
): IpcResult<null> {
  const conflict = checkConflict(path, force)
  if (!conflict.ok) return conflict
  try {
    const text = stringifyCsvTable(fromRecords(header, records))
    readHashes.set(path, writeTextFile(path, text))
    return ok(null)
  } catch (error) {
    return fail('io', describeIoError(error, basename(path)))
  }
}

export type LoadedMaster = {
  exists: boolean
  rows: MasterRow[]
  notice: EncodingNotice | null
  duplicateKeys: string[]
}

/** strings_master.csv 를 읽는다. 파일이 없으면 빈 목록. */
export function loadMaster(dir: string): IpcResult<LoadedMaster> {
  const path = masterPath(dir)
  const loaded = loadCsv(path)
  if (!loaded.ok) return loaded
  if (loaded.value === null) return ok({ exists: false, rows: [], notice: null, duplicateKeys: [] })

  const parsed = toMasterRows(loaded.value.records, loaded.value.header)
  if (parsed.missingColumns.length > 0) {
    return fail(
      'invalid-project',
      `${MASTER_FILE} 에 필수 열이 없습니다: ${parsed.missingColumns.join(', ')}`
    )
  }
  return ok({
    exists: true,
    rows: parsed.rows,
    notice: loaded.value.encoding === 'cp949' ? { file: MASTER_FILE, encoding: 'cp949' } : null,
    duplicateKeys: parsed.duplicateKeys
  })
}

export type LoadedTranslations = {
  rows: TranslationRow[]
  notice: EncodingNotice | null
  exists: boolean
}

export function loadTranslations(dir: string, language: string): IpcResult<LoadedTranslations> {
  const path = translationPath(dir, language)
  const loaded = loadCsv(path)
  if (!loaded.ok) return loaded
  if (loaded.value === null) return ok({ rows: [], notice: null, exists: false })

  const parsed = toTranslationRows(loaded.value.records)
  return ok({
    rows: parsed.rows,
    notice:
      loaded.value.encoding === 'cp949'
        ? { file: translationFile(language), encoding: 'cp949' }
        : null,
    exists: true
  })
}

/**
 * 번역 행에 남은 "번역할 때 본 원문". 해시와 맞지 않으면(앱 밖에서 한쪽만 고친 경우) 믿을 수 없어 버린다.
 * 해시는 메인에서만 계산할 수 있으므로 렌더러에 넘기기 전에 여기서 거른다.
 */
export function trustedSnapshot(row: Pick<TranslationRow, 'source_snapshot' | 'source_hash'> | undefined): string {
  if (!row || row.source_snapshot === '') return ''
  return sourceHash(row.source_snapshot) === row.source_hash ? row.source_snapshot : ''
}

/** 원문과 선택한 언어의 번역을 합쳐 그리드용 행을 만든다. */
export function joinRows(master: readonly MasterRow[], translations: readonly TranslationRow[]): StringsRow[] {
  const byKey = new Map(translations.map((row) => [row.key, row]))
  return master.map((row) => {
    const translation = byKey.get(row.key)
    return {
      ...row,
      translation: translation?.text ?? '',
      status: translation?.status ?? 'untranslated',
      confidence: translation?.confidence ?? '',
      note: translation?.note ?? '',
      source_snapshot: trustedSnapshot(translation)
    }
  })
}

export type SaveResult = {
  staleMarked: number
  staleKeys: string[]
  /** 번역 파일에서 함께 지운 행 수(모든 파일 합계). */
  removedTranslations: number
}

const TRANSLATION_PREFIX = 'translations_'
const TRANSLATION_SUFFIX = '.csv'

/**
 * 폴더에 실제로 있는 번역 파일의 언어 코드.
 * 대상 언어 목록에서 빠진 언어의 파일도 포함한다 — 삭제한 키가 거기 고아로 남지 않게.
 */
export function listTranslationLanguages(dir: string): string[] {
  return readdirSync(dir)
    .filter(
      (name) =>
        name.startsWith(TRANSLATION_PREFIX) &&
        name.endsWith(TRANSLATION_SUFFIX) &&
        name.length > TRANSLATION_PREFIX.length + TRANSLATION_SUFFIX.length
    )
    .map((name) => name.slice(TRANSLATION_PREFIX.length, name.length - TRANSLATION_SUFFIX.length))
    .sort()
}

/**
 * 원문을 저장하고 번역 파일을 원문에 맞춘다.
 * - 원문이 바뀐 번역은 stale로 표시한다.
 * - deletedKeys 의 행은 모든 번역 파일에서 지운다.
 * 번역 파일이 없는 언어는 만들지 않는다 — 빈 행을 미리 채우지 않는다.
 * 번역 파일은 저장 직전에 다시 읽어 고친다. 앱 밖에서 바뀐 번역을 덮어쓰지 않기 위해서다.
 */
export function saveMaster(
  dir: string,
  rows: readonly MasterRow[],
  force: boolean,
  deletedKeys: readonly string[] = []
): IpcResult<SaveResult> {
  // 그리드에서 원문을 고쳤을 수 있으므로 저장 직전에 해시를 다시 맞춘다.
  const normalized = rows.map(rehash)
  const masterSave = saveCsv(masterPath(dir), MASTER_COLUMNS, masterToRecords(normalized), force)
  if (!masterSave.ok) return masterSave

  const hashByKey = new Map(normalized.map((row) => [row.key, row.source_hash]))
  const deleted = new Set(deletedKeys)
  const staleKeys: string[] = []
  let removedTranslations = 0

  // 원문은 이미 저장됐다. 여기서 실패하면 그 사실을 알리고, 다시 저장하면 이어서 맞춘다.
  const partial = (file: string, error: { message: string; detail?: string }): IpcResult<SaveResult> =>
    fail(
      'io',
      `원문은 저장했지만 ${file} 을 고치지 못했습니다. 원인을 해결한 뒤 다시 저장하세요.`,
      error.detail ? `${error.message} ${error.detail}` : error.message
    )

  for (const language of listTranslationLanguages(dir)) {
    const file = translationFile(language)
    const loaded = loadTranslations(dir, language)
    if (!loaded.ok) return partial(file, loaded.error)

    const kept = loaded.value.rows.filter((row) => !deleted.has(row.key))
    const removed = loaded.value.rows.length - kept.length
    const result = applyStale(kept, hashByKey)
    if (removed === 0 && result.markedKeys.length === 0) continue

    const write = saveCsv(translationPath(dir, language), TRANSLATION_COLUMNS, translationToRecords(result.rows), force)
    if (!write.ok) return partial(file, write.error)
    staleKeys.push(...result.markedKeys)
    removedTranslations += removed
  }

  return ok({ staleMarked: staleKeys.length, staleKeys, removedTranslations })
}

export const GLOSSARY_FILE = 'glossary.csv'

function glossaryPath(dir: string): string {
  return join(dir, GLOSSARY_FILE)
}

/** 용어집에서 해당 언어의 승인된 용어를 읽는다. 파일이 없으면 빈 목록. */
export function loadGlossaryTerms(dir: string, language: string): IpcResult<GlossaryTerm[]> {
  const loaded = loadCsv(glossaryPath(dir))
  if (!loaded.ok) return loaded
  if (loaded.value === null) return ok([])
  return ok(parseGlossary(loaded.value.records, language))
}

type LoadedGlossary = { view: GlossaryView; records: Record<string, string>[]; header: string[] }

function readGlossary(dir: string, languages: readonly string[]): IpcResult<LoadedGlossary> {
  const loaded = loadCsv(glossaryPath(dir))
  if (!loaded.ok) return loaded
  const records = loaded.value?.records ?? []
  const { entries, duplicates } = toGlossaryEntries(records, languages)
  return ok({
    records,
    header: loaded.value?.header ?? [],
    view: {
      exists: loaded.value !== null,
      entries,
      languages: [...languages],
      duplicates,
      notices: loaded.value?.encoding === 'cp949' ? [{ file: GLOSSARY_FILE, encoding: 'cp949' }] : []
    }
  })
}

/** 용어집 화면용. 승인 대기 후보까지 모두 담는다. */
export function loadGlossary(dir: string, languages: readonly string[]): IpcResult<GlossaryView> {
  const loaded = readGlossary(dir, languages)
  return loaded.ok ? ok(loaded.value.view) : loaded
}

function writeGlossary(
  dir: string,
  header: readonly string[],
  records: readonly Record<string, string>[],
  languages: readonly string[]
): IpcResult<null> {
  return saveCsv(glossaryPath(dir), glossaryHeader(header, languages), records, false)
}

/**
 * 용어집 화면의 변경을 적용한다. 파일을 다시 읽어 행마다 화면이 본 값과 비교하고, 통과한 변경만 모아 한 번에 쓴다.
 * 추출 작업이 그 사이 붙인 후보는 다시 읽은 내용에 그대로 남는다.
 */
export function updateGlossary(
  dir: string,
  changes: readonly GlossaryChangeInput[],
  languages: readonly string[]
): IpcResult<UpdateGlossaryResult> {
  const loaded = readGlossary(dir, languages)
  if (!loaded.ok) return loaded
  const result = applyGlossaryChanges(loaded.value.records, changes, languages)
  if (result.applied.length === 0) return ok({ view: loaded.value.view, applied: [], skipped: result.skipped })

  const write = writeGlossary(dir, loaded.value.header, result.records, languages)
  if (!write.ok) return write
  const view = readGlossary(dir, languages)
  if (!view.ok) return view
  return ok({ view: view.value.view, applied: result.applied, skipped: result.skipped })
}

/**
 * 용어 후보를 승인 대기로 붙인다(추출 배치·패널 제안). 다시 읽기 → 합치기 → 원자적 쓰기가 동기 함수 하나라
 * 병렬 배치가 같은 용어를 내도 먼저 기록한 쪽만 남는다.
 */
export function appendGlossaryCandidates(
  dir: string,
  candidates: readonly GlossaryCandidate[],
  languages: readonly string[]
): IpcResult<{ added: string[]; existing: string[] }> {
  const loaded = readGlossary(dir, languages)
  if (!loaded.ok) return loaded
  const result = appendCandidates(loaded.value.records, candidates, languages)
  if (result.added.length > 0) {
    const write = writeGlossary(dir, loaded.value.header, result.records, languages)
    if (!write.ok) return write
  }
  return ok({ added: result.added, existing: result.existing })
}

/**
 * 용어 번역 결과로 빈 칸만 채운다. 다시 읽기 → 합치기 → 원자적 쓰기가 동기 함수 하나라 병렬 배치·화면 저장과 겹쳐도
 * 그 사이 채워진 칸을 덮지 않는다. 승인된 용어에 채운 언어는 승인 대기로 표시된다(fillTermTranslations).
 */
export function fillGlossaryTranslations(
  dir: string,
  results: readonly Pick<TermTranslationResult, 'term' | 'translations'>[],
  languages: readonly string[]
): IpcResult<{ filled: { term: string; languages: string[] }[]; skipped: string[] }> {
  const loaded = readGlossary(dir, languages)
  if (!loaded.ok) return loaded
  const result = fillTermTranslations(loaded.value.records, results)
  if (result.filled.length > 0) {
    const write = writeGlossary(dir, loaded.value.header, result.records, languages)
    if (!write.ok) return write
  }
  return ok({ filled: result.filled, skipped: result.skipped })
}

/** 승인된 용어 중 이 언어의 확정 번역이 없는 용어. 파일이 없으면 빈 목록 */
export function loadTermsWithoutConfirmedTranslation(dir: string, language: string): IpcResult<string[]> {
  const loaded = loadCsv(glossaryPath(dir))
  if (!loaded.ok) return loaded
  return ok(loaded.value === null ? [] : termsWithoutConfirmedTranslation(loaded.value.records, language))
}

/** 용어집에 있는 모든 용어(승인 대기 포함). 추출 배치가 이미 있는 용어를 다시 내지 않게 쓴다. */
export function loadAllGlossaryTerms(dir: string): IpcResult<string[]> {
  const loaded = readGlossary(dir, [])
  return loaded.ok ? ok(loaded.value.view.entries.map((entry) => entry.term)) : loaded
}

export const CONTEXT_SUGGESTIONS_FILE = 'context_suggestions.csv'

function suggestionsPath(dir: string): string {
  return join(dir, CONTEXT_SUGGESTIONS_FILE)
}

export type LoadedSuggestions = { rows: ContextSuggestion[]; notice: EncodingNotice | null }

/** 승인을 기다리는 메타데이터 제안. 파일이 없으면 빈 목록. */
export function loadContextSuggestions(dir: string): IpcResult<LoadedSuggestions> {
  const loaded = loadCsv(suggestionsPath(dir))
  if (!loaded.ok) return loaded
  if (loaded.value === null) return ok({ rows: [], notice: null })
  return ok({
    rows: toSuggestions(loaded.value.records),
    notice: loaded.value.encoding === 'cp949' ? { file: CONTEXT_SUGGESTIONS_FILE, encoding: 'cp949' } : null
  })
}

function saveSuggestions(dir: string, rows: readonly ContextSuggestion[]): IpcResult<null> {
  return saveCsv(suggestionsPath(dir), SUGGESTION_COLUMNS, suggestionsToRecords(rows), false)
}

/** 추정 배치의 제안을 합쳐 쓴다. 같은 키의 옛 제안은 새 제안으로 바뀐다. */
export function writeContextSuggestions(dir: string, incoming: readonly ContextSuggestion[]): IpcResult<null> {
  const loaded = loadContextSuggestions(dir)
  if (!loaded.ok) return loaded
  return saveSuggestions(dir, mergeSuggestions(loaded.value.rows, incoming))
}

/** 제안을 버린다. 파일에 없는 키는 무시한다. */
export function discardContextSuggestions(dir: string, keys: readonly string[]): IpcResult<number> {
  const loaded = loadContextSuggestions(dir)
  if (!loaded.ok) return loaded
  const kept = removeSuggestions(loaded.value.rows, keys)
  const removed = loaded.value.rows.length - kept.length
  if (removed === 0) return ok(0)
  const write = saveSuggestions(dir, kept)
  return write.ok ? ok(removed) : write
}

/**
 * 승인한 제안을 strings_master.csv 에 넣고, 넣은 키의 제안을 지운다.
 * 원문은 다시 읽어서 고친다 — 화면이 본 뒤 그 칸이 바뀐 행은 덮지 않고 건너뛴다.
 * 메타데이터만 바꾸므로 원문 해시와 번역 상태는 그대로다.
 */
export function applyContextSuggestions(dir: string, items: readonly ApplyContextItem[]): IpcResult<ApplyContextResult> {
  const master = loadMaster(dir)
  if (!master.ok) return master
  if (!master.value.exists) return fail('invalid-input', `${MASTER_FILE} 이 없습니다.`)
  const result = applySuggestionValues(master.value.rows, items)
  if (result.applied.length > 0) {
    const saved = saveMaster(dir, result.rows, false)
    if (!saved.ok) return saved
    const removed = discardContextSuggestions(dir, result.applied)
    if (!removed.ok) {
      return fail('io', `원문에는 넣었지만 ${CONTEXT_SUGGESTIONS_FILE} 에서 적용한 제안을 지우지 못했습니다.`, removed.error.message)
    }
  }
  return ok({ applied: result.applied, skipped: result.skipped })
}

export type BatchWriteResult = { written: number; skippedApproved: string[]; skippedChanged: string[] }

/**
 * 검증을 통과한 배치를 번역 파일에 기록한다. 다시 읽기 → 병합 → 원자적 쓰기를
 * 동기 함수 하나로 처리하므로, 같은 프로세스의 다른 작업자가 사이에 끼어들 수 없다.
 * 앱 밖에서 바뀐 번역은 다시 읽은 내용에 합쳐지므로 덮어쓰지 않는다.
 */
export function writeBatchTranslations(
  dir: string,
  language: string,
  items: readonly SubmittedTranslation[],
  masterByKey: ReadonlyMap<string, MasterSource>,
  /** 작업을 시작할 때 본 행. 그 뒤 사람이 고친 행은 덮지 않는다. */
  baseline?: ReadonlyMap<string, string>
): IpcResult<BatchWriteResult> {
  const loaded = loadTranslations(dir, language)
  if (!loaded.ok) return loaded
  const merged = mergeTranslations(loaded.value.rows, items, masterByKey, baseline)
  const write = saveCsv(
    translationPath(dir, language),
    TRANSLATION_COLUMNS,
    translationToRecords(merged.rows),
    false
  )
  if (!write.ok) return write
  return ok({
    written: merged.written.length,
    skippedApproved: merged.skippedApproved,
    skippedChanged: merged.skippedChanged
  })
}

export type RowUpdate = {
  key: string
  master: MasterSource
  change: ManualUpdate
  /** 편집을 시작할 때 본 행 */
  expected: { text: string; status: TranslationStatus }
  force: boolean
}

export type RowUpdateResult = { row: TranslationRow; diagnostics: QaDiagnostic[] }

/** 번역 행이 없는 것과 비어 있는 미번역 행은 같은 상태로 본다. */
function sameState(current: TranslationRow | undefined, expected: RowUpdate['expected']): boolean {
  return (current?.text ?? '') === expected.text && (current?.status ?? 'untranslated') === expected.status
}

/**
 * 검토 화면의 행 하나를 저장한다. 번역 파일을 다시 읽어 그 행만 바꾸고 원자적으로 쓴다.
 * 충돌은 행 단위로 본다: 디스크의 그 행이 편집을 시작할 때 본 것과 다르면(배치 기록·앱 밖 편집)
 * 묻지 않고 덮지 않는다. 다른 행이 밖에서 바뀐 것은 다시 읽은 내용에 그대로 남는다.
 * QA 오류가 있는 행은 승인하지 않는다.
 */
export function updateTranslationRow(
  dir: string,
  language: string,
  update: RowUpdate,
  qa: (row: TranslationRow) => QaDiagnostic[]
): IpcResult<RowUpdateResult> {
  const loaded = loadTranslations(dir, language)
  if (!loaded.ok) return loaded
  const rows = loaded.value.rows
  const index = rows.findIndex((row) => row.key === update.key)
  const current = index === -1 ? undefined : rows[index]

  if (!update.force && !sameState(current, update.expected)) {
    const now = current ? `[${current.status}] ${current.text}` : '(번역 행 없음)'
    return fail('conflict', `${update.key} 행이 편집하는 사이에 바뀌었습니다(번역 작업 기록 또는 앱 밖 편집).`, `지금 파일의 내용: ${now}`)
  }

  const decision = applyManualUpdate(update.key, current, update.change, update.master)
  if (!decision.ok) return fail('invalid-input', decision.reason)
  const diagnostics = qa(decision.row)
  if (update.change.status === 'approved' && hasErrors(diagnostics)) {
    const errors = diagnostics.filter((item) => item.severity === 'error').map((item) => item.message)
    return fail('invalid-input', 'QA 오류가 있어 승인할 수 없습니다.', errors.join('\n'))
  }

  // 빈 행을 새로 만들지 않는다 — 번역 파일에 빈 행을 미리 채우지 않는 규칙과 같다
  if (!current && decision.row.text === '') return ok({ row: decision.row, diagnostics })

  const next = [...rows]
  if (index === -1) next.push(decision.row)
  else next[index] = decision.row
  const write = saveCsv(translationPath(dir, language), TRANSLATION_COLUMNS, translationToRecords(next), false)
  if (!write.ok) return write
  return ok({ row: decision.row, diagnostics })
}

export type BulkApproveRequest = { key: string; expected: RowUpdate['expected'] }

/**
 * 여러 행을 한 번에 승인한다. 번역 파일을 다시 읽어 행마다 다시 확인하고, 통과한 행만 모아 한 번에 쓴다.
 * - 화면이 본 뒤 바뀐 행(배치 기록·앱 밖 편집)은 건너뛴다. 묻지 않고 덮지 않는다
 * - check 는 지금 디스크의 행으로 조건(초안·진단 없음·신뢰도)을 다시 본다
 * 한 행도 통과하지 못하면 파일을 쓰지 않는다.
 */
export function approveTranslationRows(
  dir: string,
  language: string,
  requests: readonly BulkApproveRequest[],
  masterByKey: ReadonlyMap<string, MasterSource>,
  check: (row: TranslationRow) => BulkApproveSkipReason | null
): IpcResult<BulkApproveResult> {
  const loaded = loadTranslations(dir, language)
  if (!loaded.ok) return loaded
  const rows = [...loaded.value.rows]
  const indexByKey = new Map(rows.map((row, index) => [row.key, index]))
  const approved: string[] = []
  const skipped: BulkApproveResult['skipped'] = []

  for (const request of requests) {
    const master = masterByKey.get(request.key)
    const index = indexByKey.get(request.key)
    const current = index === undefined ? undefined : rows[index]
    if (!master || index === undefined || !current) {
      skipped.push({ key: request.key, reason: 'missing' })
      continue
    }
    if (!sameState(current, request.expected)) {
      skipped.push({ key: request.key, reason: 'changed' })
      continue
    }
    const blocker = check(current)
    if (blocker) {
      skipped.push({ key: request.key, reason: blocker })
      continue
    }
    const decision = applyManualUpdate(request.key, current, { text: current.text, status: 'approved' }, master)
    if (!decision.ok) {
      skipped.push({ key: request.key, reason: 'not-draft' })
      continue
    }
    rows[index] = decision.row
    approved.push(request.key)
  }

  if (approved.length > 0) {
    const write = saveCsv(translationPath(dir, language), TRANSLATION_COLUMNS, translationToRecords(rows), false)
    if (!write.ok) return write
  }
  return ok({ approved, skipped })
}
