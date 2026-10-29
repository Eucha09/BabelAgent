import { describe, expect, it } from 'vitest'
import type { ExportColumnView } from '@shared/schema/export'
import { autoColumns, columnProblems, inferTemplateColumns, mappingMatchesHeader, templateColumns } from './header'
import { resolveLocales } from './locales'

const { locales } = resolveLocales(['ko', 'en', 'zh-Hans'], 'ko', {}, null)
const names = (columns: readonly ExportColumnView[]): string[] => columns.map((column) => column.name)

describe('autoColumns', () => {
  it('주석 옵션을 끄면 Key, Id, 언어별 값 열만 만든다', () => {
    expect(names(autoColumns(locales, { sharedComments: false, localeComments: false }))).toEqual([
      'Key',
      'Id',
      'Korean(ko)',
      'English(en)',
      'Chinese (Simplified)(zh-Hans)'
    ])
  })

  it('주석 옵션을 켜면 Shared Comments 와 언어별 Comments 열을 Unity 순서로 넣는다', () => {
    expect(names(autoColumns(locales.slice(0, 2), { sharedComments: true, localeComments: true }))).toEqual([
      'Key',
      'Id',
      'Shared Comments',
      'Korean(ko)',
      'Korean(ko) Comments',
      'English(en)',
      'English(en) Comments'
    ])
  })

  it('열마다 출처를 붙인다', () => {
    const custom = resolveLocales(['en', 'ja'], 'ko', { en: { unityLocaleCode: '', columnName: 'EN' } }, [{ code: 'ja-JP', name: 'Japanese' }])
    const columns = autoColumns(custom.locales, { sharedComments: false, localeComments: false })
    expect(columns.map((column) => column.origin)).toEqual(['auto', 'auto', 'setting', 'unity'])
  })
})

describe('inferTemplateColumns', () => {
  it('Unity 기본 헤더를 그대로 알아본다', () => {
    const header = ['Key', 'Id', 'Shared Comments', 'Korean(ko)', 'Korean(ko) Comments', 'English(en)', 'English(en) Comments']
    expect(inferTemplateColumns(header, locales).map((column) => [column.role, column.language])).toEqual([
      ['key', ''],
      ['id', ''],
      ['sharedComments', ''],
      ['value', 'ko'],
      ['comments', 'ko'],
      ['value', 'en'],
      ['comments', 'en']
    ])
  })

  it('이름이 달라도 괄호 안 코드나 코드만 쓴 열은 알아본다', () => {
    const header = ['Key', 'Korean (ko)', 'en', '简体中文(zh-hans)', 'English Text(EN) Comments']
    expect(inferTemplateColumns(header, locales).map((column) => [column.role, column.language])).toEqual([
      ['key', ''],
      ['value', 'ko'],
      ['value', 'en'],
      ['value', 'zh-Hans'],
      ['comments', 'en']
    ])
  })

  it('알아보지 못한 열은 omit — 추측하지 않는다', () => {
    const header = ['Key', 'French(fr)', 'Notes', 'id']
    expect(inferTemplateColumns(header, locales).map((column) => column.role)).toEqual(['key', 'omit', 'omit', 'omit'])
  })

  it('저장된 매핑과 헤더가 같은지 이름·순서로 본다', () => {
    const mapping = inferTemplateColumns(['Key', 'English(en)'], locales)
    expect(mappingMatchesHeader(mapping, ['Key', 'English(en)'])).toBe(true)
    expect(mappingMatchesHeader(mapping, ['English(en)', 'Key'])).toBe(false)
  })
})

describe('templateColumns', () => {
  const mapping = inferTemplateColumns(
    ['English(en)', 'Notes', 'Key', 'Shared Comments', 'Korean(ko)', 'English(en) Comments', 'Id'],
    locales
  )

  it('템플릿 순서를 지키고 omit 열은 뺀다', () => {
    expect(names(templateColumns(mapping, new Set(['ko', 'en']), { sharedComments: true, localeComments: true }))).toEqual([
      'English(en)',
      'Key',
      'Shared Comments',
      'Korean(ko)',
      'English(en) Comments',
      'Id'
    ])
  })

  it('고르지 않은 언어와 끈 주석 열은 뺀다', () => {
    expect(names(templateColumns(mapping, new Set(['ko']), { sharedComments: false, localeComments: false }))).toEqual([
      'Key',
      'Korean(ko)',
      'Id'
    ])
  })
})

describe('columnProblems', () => {
  const column = (name: string, role: ExportColumnView['role'], language: string | null = null): ExportColumnView => ({
    name,
    role,
    language,
    origin: 'auto'
  })

  it('정상 헤더는 문제없음', () => {
    expect(columnProblems(autoColumns(locales, { sharedComments: true, localeComments: true }))).toEqual([])
  })

  it('Key 열 없음, 빈 이름, 겹치는 이름, 같은 역할 두 번', () => {
    expect(columnProblems([column('Id', 'id')])).toHaveLength(1)
    expect(columnProblems([column('Key', 'key'), column('', 'value', 'en')])).toHaveLength(1)
    expect(columnProblems([column('Key', 'key'), column('X', 'value', 'en'), column('X', 'value', 'ko')])[0]).toContain('X')
    expect(columnProblems([column('Key', 'key'), column('A', 'value', 'en'), column('B', 'value', 'en')])[0]).toContain('B')
  })
})
