import type { ExportColumnView, ExportLanguageView, TemplateColumn } from '@shared/schema/export'
import type { Messages } from '@shared/i18n'

/** Unity CSV 확장(KeyIdColumns)의 기본 열 이름 */
export const KEY_COLUMN = 'Key'
export const ID_COLUMN = 'Id'
export const SHARED_COMMENTS_COLUMN = 'Shared Comments'
/** LocaleColumns 의 주석 열 이름 = 값 열 이름 + 이 접미사 */
export const COMMENTS_SUFFIX = ' Comments'

export type CommentOptions = { sharedComments: boolean; localeComments: boolean }

/**
 * 템플릿 없이 만드는 헤더. 순서: Key, Id, (Shared Comments), 언어마다 값 열과 (주석 열).
 * 주석 옵션을 끄면 열을 만들지 않는다 — 빈 칸은 Unity 의 기존 주석을 지운다.
 */
export function autoColumns(locales: readonly ExportLanguageView[], options: CommentOptions): ExportColumnView[] {
  const columns: ExportColumnView[] = [
    { name: KEY_COLUMN, role: 'key', language: null, origin: 'auto' },
    { name: ID_COLUMN, role: 'id', language: null, origin: 'auto' }
  ]
  if (options.sharedComments) {
    columns.push({ name: SHARED_COMMENTS_COLUMN, role: 'sharedComments', language: null, origin: 'auto' })
  }
  for (const locale of locales) {
    const origin = locale.nameOrigin === 'setting' ? 'setting' : locale.codeOrigin === 'unity' ? 'unity' : 'auto'
    columns.push({ name: locale.columnName, role: 'value', language: locale.language, origin })
    if (options.localeComments) {
      columns.push({ name: `${locale.columnName}${COMMENTS_SUFFIX}`, role: 'comments', language: locale.language, origin })
    }
  }
  return columns
}

/** `English(en)` · `Chinese (Simplified)(zh-Hans)` 에서 괄호 안 코드. 마지막 괄호를 본다. */
function codeInParens(name: string): string | null {
  const match = /\(([^()]+)\)\s*$/.exec(name)
  return match?.[1]?.trim() ?? null
}

/**
 * 템플릿 헤더의 열마다 역할을 추론한다. 알아보지 못한 열은 omit — 추측으로 채우지 않는다.
 * locales 는 프로젝트 언어 전체(내보내기에서 고른 언어와 무관)로 넘긴다.
 */
export function inferTemplateColumns(header: readonly string[], locales: readonly ExportLanguageView[]): TemplateColumn[] {
  const byName = new Map<string, string>()
  for (const locale of locales) byName.set(locale.columnName, locale.language)
  const byCode = new Map<string, string>()
  for (const locale of locales) {
    byCode.set(locale.unityLocaleCode.toLowerCase(), locale.language)
    byCode.set(locale.language.toLowerCase(), locale.language)
  }

  const valueLanguage = (name: string): string | null => {
    const exact = byName.get(name)
    if (exact !== undefined) return exact
    const code = codeInParens(name) ?? name.trim()
    return byCode.get(code.toLowerCase()) ?? null
  }

  return header.map((raw): TemplateColumn => {
    const name = raw.trim()
    if (name === KEY_COLUMN) return { name: raw, role: 'key', language: '' }
    if (name === ID_COLUMN) return { name: raw, role: 'id', language: '' }
    if (name === SHARED_COMMENTS_COLUMN) return { name: raw, role: 'sharedComments', language: '' }
    if (name.endsWith(COMMENTS_SUFFIX)) {
      const language = valueLanguage(name.slice(0, -COMMENTS_SUFFIX.length))
      if (language !== null) return { name: raw, role: 'comments', language }
    }
    const language = valueLanguage(name)
    if (language !== null) return { name: raw, role: 'value', language }
    return { name: raw, role: 'omit', language: '' }
  })
}

/** 저장된 매핑이 지금 템플릿 헤더(이름·순서)와 같은지 */
export function mappingMatchesHeader(columns: readonly TemplateColumn[], header: readonly string[]): boolean {
  return columns.length === header.length && columns.every((column, index) => column.name === header[index])
}

/**
 * 템플릿 매핑으로 내보낼 열. 템플릿 순서를 지키고 다음 열은 뺀다: omit, 고르지 않은 언어, 끈 주석 열.
 * 모두 Unity 가 그 열을 건드리지 않게 하려는 것이다.
 */
export function templateColumns(
  mapping: readonly TemplateColumn[],
  languages: ReadonlySet<string>,
  options: CommentOptions
): ExportColumnView[] {
  const columns: ExportColumnView[] = []
  for (const column of mapping) {
    if (column.role === 'omit') continue
    if (column.role === 'sharedComments' && !options.sharedComments) continue
    if (column.role === 'comments' && !options.localeComments) continue
    const language = column.role === 'value' || column.role === 'comments' ? column.language : null
    if (language !== null && !languages.has(language)) continue
    columns.push({ name: column.name, role: column.role, language, origin: 'template' })
  }
  return columns
}

/** 내보내기를 막는 열 문제: Key 열 없음, 빈 이름, 겹치는 이름, 역할이 겹치는 열. */
export function columnProblems(columns: readonly ExportColumnView[], t: Messages): string[] {
  const problems: string[] = []
  if (!columns.some((column) => column.role === 'key')) problems.push(t.exportCheck.noKeyColumn(KEY_COLUMN))
  if (columns.some((column) => column.name.trim() === '')) problems.push(t.exportCheck.emptyColumnName)

  const seenNames = new Set<string>()
  const duplicateNames = new Set<string>()
  const seenRoles = new Set<string>()
  const duplicateRoles = new Set<string>()
  for (const column of columns) {
    if (seenNames.has(column.name)) duplicateNames.add(column.name)
    seenNames.add(column.name)
    const role = `${column.role}:${column.language ?? ''}`
    if (seenRoles.has(role)) duplicateRoles.add(column.name)
    seenRoles.add(role)
  }
  if (duplicateNames.size > 0) problems.push(t.exportCheck.duplicateColumnNames([...duplicateNames].join(', ')))
  if (duplicateRoles.size > 0) problems.push(t.exportCheck.duplicateRoles([...duplicateRoles].join(', ')))
  return problems
}
