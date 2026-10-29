import { describe, expect, it } from 'vitest'
import type { ExportMissing } from '@shared/schema/export'
import type { MasterRow, TranslationRow } from '@shared/schema/strings'
import { parseCsvTable, stringifyCsvTable } from '../csv/codec'
import { sourceHash } from '../hash'
import { autoColumns } from './header'
import { resolveLocales } from './locales'
import { buildExportTable, sanitizeFileName, usableTranslation, type ExportTranslations } from './rows'

const master = (key: string, source: string, context = ''): MasterRow => ({
  key,
  source,
  context,
  ui_type: '',
  max_len: '',
  vars: '',
  smart: '',
  tags: '',
  source_hash: sourceHash(source)
})

const translation = (row: MasterRow, text: string, status: TranslationRow['status'] = 'draft', note = ''): TranslationRow => ({
  key: row.key,
  text,
  source_hash: row.source_hash,
  status,
  confidence: '',
  note,
  source_snapshot: row.source
})

const a = master('a', '시작', '메인 메뉴 버튼')
const b = master('b', '{count}개 획득')
const c = master('c', '닫기')

const translations = (en: TranslationRow[], ja: TranslationRow[] = []): ExportTranslations =>
  new Map([
    ['en', new Map(en.map((row) => [row.key, row]))],
    ['ja', new Map(ja.map((row) => [row.key, row]))]
  ])

const { locales } = resolveLocales(['ko', 'en'], 'ko', {}, null)
const columns = autoColumns(locales, { sharedComments: true, localeComments: true })

const build = (missing: ExportMissing, data = translations([translation(a, 'Start', 'approved', '버튼'), translation(b, '{count} acquired', 'stale')])) =>
  buildExportTable({ master: [a, b, c], sourceLanguage: 'ko', translations: data, columns, missing, ids: new Map([['a', '1234567890123456789']]) })

describe('usableTranslation', () => {
  it('번역문이 있고 미번역·stale 이 아니며 해시가 같아야 한다', () => {
    expect(usableTranslation(a, translation(a, 'Start'))).toBe(true)
    expect(usableTranslation(a, translation(a, 'Start', 'stale'))).toBe(false)
    expect(usableTranslation(a, translation(a, '', 'draft'))).toBe(false)
    expect(usableTranslation(a, undefined)).toBe(false)
    expect(usableTranslation(a, { ...translation(a, 'Start'), source_hash: 'other' })).toBe(false)
  })
})

describe('buildExportTable', () => {
  it('empty: 번역 없음·stale 칸을 비우고 Id·context·note 를 채운다', () => {
    const result = build('empty')
    expect(result.header).toEqual(['Key', 'Id', 'Shared Comments', 'Korean(ko)', 'Korean(ko) Comments', 'English(en)', 'English(en) Comments'])
    expect(result.rows).toEqual([
      ['a', '1234567890123456789', '메인 메뉴 버튼', '시작', '', 'Start', '버튼'],
      ['b', '', '', '{count}개 획득', '', '', ''],
      ['c', '', '', '닫기', '', '', '']
    ])
    expect(result.summary).toMatchObject({ rows: 3, skippedRows: 0 })
    expect(result.summary.languages).toEqual([
      { language: 'ko', filled: 3, blank: 0, sourceFilled: 0 },
      { language: 'en', filled: 1, blank: 2, sourceFilled: 0 }
    ])
    expect(result.exportedCells.get('en')).toEqual(['a'])
  })

  it('source: 빈 칸을 원문으로 채운다', () => {
    const result = build('source')
    expect(result.rows.map((row) => row[5])).toEqual(['Start', '{count}개 획득', '닫기'])
    expect(result.summary.languages[1]).toEqual({ language: 'en', filled: 1, blank: 0, sourceFilled: 2 })
    expect(result.exportedCells.get('en')).toEqual(['a'])
  })

  it('skip: 내보내는 대상 언어 중 하나라도 빈 행을 뺀다', () => {
    const result = build('skip')
    expect(result.keys).toEqual(['a'])
    expect(result.summary).toMatchObject({ rows: 1, skippedRows: 2, skippedKeys: ['b', 'c'] })
  })

  it('행 순서는 원문 파일 순서 그대로', () => {
    const result = buildExportTable({
      master: [c, a, b],
      sourceLanguage: 'ko',
      translations: translations([]),
      columns,
      missing: 'empty',
      ids: new Map()
    })
    expect(result.keys).toEqual(['c', 'a', 'b'])
  })

  it('쉼표·줄바꿈·따옴표·Smart 중괄호가 CSV 를 왕복해도 같다', () => {
    const tricky = master('t,1', '줄\n바꿈, "따옴표" {0:plural:개|개}', '쉼표, 그리고 "인용"')
    const result = buildExportTable({
      master: [tricky],
      sourceLanguage: 'ko',
      translations: translations([translation(tricky, 'line\r\nbreak, "quote" {0:plural:one|many}', 'review', '메모,\n둘째 줄')]),
      columns,
      missing: 'empty',
      ids: new Map()
    })
    const text = stringifyCsvTable({ header: result.header, rows: result.rows })
    const back = parseCsvTable(text)
    expect(back.header).toEqual(result.header)
    expect(back.rows).toEqual(result.rows)
  })
})

describe('sanitizeFileName', () => {
  it('파일 이름으로 쓸 수 없는 글자를 지운다', () => {
    expect(sanitizeFileName('UI: Main/Menu?', 'x')).toBe('UI MainMenu')
    expect(sanitizeFileName('  name. ', 'x')).toBe('name')
    expect(sanitizeFileName('???', 'strings')).toBe('strings')
    expect(sanitizeFileName('CON', 'strings')).toBe('strings')
  })
})
