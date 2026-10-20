import { basename, join } from 'node:path'
import { existsSync } from 'node:fs'
import { fromRecords, parseCsvTable, stringifyCsvTable, toRecords } from '@core/csv/codec'
import {
  masterToRecords,
  rehash,
  toMasterRows,
  toTranslationRows,
  translationToRecords
} from '@core/strings/master'
import { applyStale } from '@core/strings/stale'
import {
  MASTER_COLUMNS,
  TRANSLATION_COLUMNS,
  type EncodingNotice,
  type MasterRow,
  type StringsRow,
  type TranslationRow
} from '@shared/schema/strings'
import type { ProjectConfig } from '@shared/schema/project'
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
  rows: MasterRow[]
  notice: EncodingNotice | null
  duplicateKeys: string[]
}

/** strings_master.csv 를 읽는다. 파일이 없으면 빈 목록. */
export function loadMaster(dir: string): IpcResult<LoadedMaster> {
  const path = masterPath(dir)
  const loaded = loadCsv(path)
  if (!loaded.ok) return loaded
  if (loaded.value === null) return ok({ rows: [], notice: null, duplicateKeys: [] })

  const parsed = toMasterRows(loaded.value.records, loaded.value.header)
  if (parsed.missingColumns.length > 0) {
    return fail(
      'invalid-project',
      `${MASTER_FILE} 에 필수 열이 없습니다: ${parsed.missingColumns.join(', ')}`
    )
  }
  return ok({
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
      note: translation?.note ?? ''
    }
  })
}

export type SaveResult = { staleMarked: number; staleKeys: string[] }

/**
 * 원문을 저장하고, 원문이 바뀐 번역을 stale로 표시한다.
 * 번역 파일이 없는 언어는 건드리지 않는다 — 빈 행을 미리 만들지 않는다.
 */
export function saveMaster(
  dir: string,
  config: ProjectConfig,
  rows: readonly MasterRow[],
  force: boolean
): IpcResult<SaveResult> {
  // 그리드에서 원문을 고쳤을 수 있으므로 저장 직전에 해시를 다시 맞춘다.
  const normalized = rows.map(rehash)
  const masterSave = saveCsv(masterPath(dir), MASTER_COLUMNS, masterToRecords(normalized), force)
  if (!masterSave.ok) return masterSave

  const hashByKey = new Map(normalized.map((row) => [row.key, row.source_hash]))
  const staleKeys: string[] = []

  for (const language of config.targetLanguages) {
    const path = translationPath(dir, language)
    if (!existsSync(path)) continue

    const loaded = loadTranslations(dir, language)
    if (!loaded.ok) return loaded

    const result = applyStale(loaded.value.rows, hashByKey)
    if (result.markedKeys.length === 0) continue

    const write = saveCsv(path, TRANSLATION_COLUMNS, translationToRecords(result.rows), force)
    if (!write.ok) return write
    staleKeys.push(...result.markedKeys)
  }

  return ok({ staleMarked: staleKeys.length, staleKeys })
}
