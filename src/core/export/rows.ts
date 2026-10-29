import type {
  ExportColumnView,
  ExportLanguageSummary,
  ExportMissing,
  ExportSummary
} from '@shared/schema/export'
import type { MasterRow, TranslationRow } from '@shared/schema/strings'

/** 언어 → 키 → 번역 행. 대상 언어만 담는다. */
export type ExportTranslations = ReadonlyMap<string, ReadonlyMap<string, TranslationRow>>

/** 요약에 담는 뺀 행 키 수. 나머지는 개수로만 보여 준다. */
const SKIPPED_KEY_SAMPLE = 20

/**
 * 그대로 내보낼 수 있는 번역: 번역문이 있고, 미번역·stale 이 아니며, 번역할 때 본 원문이 지금 원문과 같다.
 * 해시가 다른데 stale 표시가 없는 행(앱 밖에서 원문만 고친 경우)도 stale 로 친다.
 */
export function usableTranslation(master: MasterRow, row: TranslationRow | undefined): row is TranslationRow {
  if (!row) return false
  if (row.text.trim() === '') return false
  if (row.status === 'untranslated' || row.status === 'stale') return false
  return row.source_hash === master.source_hash
}

export type ExportBuildInput = {
  master: readonly MasterRow[]
  sourceLanguage: string
  translations: ExportTranslations
  columns: readonly ExportColumnView[]
  missing: ExportMissing
  /** 키 → Unity Id. 없는 키는 빈 칸(Unity 가 새 Id 를 붙인다) */
  ids: ReadonlyMap<string, string>
}

export type ExportBuild = {
  header: string[]
  rows: string[][]
  /** 내보낸 행의 키(파일 순서) */
  keys: string[]
  /** 언어 → 번역문을 그대로 내보낸 키. 내보내기 QA 는 이 칸만 본다 */
  exportedCells: Map<string, string[]>
  summary: ExportSummary
}

type CellCounts = { filled: number; blank: number; sourceFilled: number }

/**
 * Unity CSV 의 표를 만든다. 원문 언어 값은 source, 대상 언어 값은 쓸 수 있는 번역이고,
 * 번역이 없거나 stale 인 칸은 missing 옵션을 따른다(empty: 비움, source: 원문, skip: 행을 뺌).
 */
export function buildExportTable(input: ExportBuildInput): ExportBuild {
  const { master, sourceLanguage, translations, columns, missing, ids } = input
  const valueLanguages = [
    ...new Set(columns.filter((column) => column.role === 'value' && column.language !== null).map((column) => column.language ?? ''))
  ]
  const targetLanguages = valueLanguages.filter((language) => language !== sourceLanguage)

  const counts = new Map<string, CellCounts>(valueLanguages.map((language) => [language, { filled: 0, blank: 0, sourceFilled: 0 }]))
  const exportedCells = new Map<string, string[]>(targetLanguages.map((language) => [language, []]))
  const rows: string[][] = []
  const keys: string[] = []
  const skippedKeys: string[] = []

  for (const row of master) {
    const usable = new Map<string, TranslationRow>()
    for (const language of targetLanguages) {
      const translation = translations.get(language)?.get(row.key)
      if (usableTranslation(row, translation)) usable.set(language, translation)
    }
    if (missing === 'skip' && usable.size < targetLanguages.length) {
      skippedKeys.push(row.key)
      continue
    }

    const cells = columns.map((column): string => {
      switch (column.role) {
        case 'key':
          return row.key
        case 'id':
          return ids.get(row.key) ?? ''
        case 'sharedComments':
          return row.context
        case 'omit':
          return ''
        case 'comments':
          return column.language === null || column.language === sourceLanguage ? '' : (usable.get(column.language)?.note ?? '')
        case 'value':
          return valueCell(row, column.language, sourceLanguage, usable, missing)
      }
    })

    for (const language of valueLanguages) {
      const count = counts.get(language)
      if (!count) continue
      if (language === sourceLanguage) {
        if (row.source === '') count.blank += 1
        else count.filled += 1
      } else if (usable.has(language)) {
        count.filled += 1
        exportedCells.get(language)?.push(row.key)
      } else if (missing === 'source') {
        count.sourceFilled += 1
      } else {
        count.blank += 1
      }
    }

    rows.push(cells)
    keys.push(row.key)
  }

  const languages: ExportLanguageSummary[] = valueLanguages.map((language) => ({
    language,
    ...(counts.get(language) ?? { filled: 0, blank: 0, sourceFilled: 0 })
  }))

  return {
    header: columns.map((column) => column.name),
    rows,
    keys,
    exportedCells,
    summary: {
      rows: rows.length,
      skippedRows: skippedKeys.length,
      skippedKeys: skippedKeys.slice(0, SKIPPED_KEY_SAMPLE),
      languages
    }
  }
}

function valueCell(
  row: MasterRow,
  language: string | null,
  sourceLanguage: string,
  usable: ReadonlyMap<string, TranslationRow>,
  missing: ExportMissing
): string {
  if (language === null) return ''
  if (language === sourceLanguage) return row.source
  const translation = usable.get(language)
  if (translation) return translation.text
  return missing === 'source' ? row.source : ''
}

/** 파일 이름으로 쓸 수 없는 글자를 지운다. 비면 fallback. */
export function sanitizeFileName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
    .replace(/[. ]+$/, '')
  if (cleaned === '' || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)) return fallback
  return cleaned
}

/** 글자 목록 파일 이름에 넣을 언어 코드 */
export function glyphFileName(base: string, language: string): string {
  return `${base}_chars_${language}.txt`
}

export function smartFileName(base: string): string {
  return `${base}_smart.csv`
}
