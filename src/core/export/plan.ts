import type {
  ExportColumnView,
  ExportLanguageView,
  ExportRequest,
  SmartItem,
  TemplateColumn,
  TemplateView,
  UnityLocaleInfo,
  UnityView
} from '@shared/schema/export'
import type { ProjectConfig } from '@shared/schema/project'
import type { MasterRow } from '@shared/schema/strings'
import type { SmartSyntax } from '../qa/smart'
import { needsSmartSuggestion, parseSmartFlag } from '../strings/smart'
import { collectGlyphs } from './glyphs'
import { autoColumns, columnProblems, ID_COLUMN, inferTemplateColumns, KEY_COLUMN, mappingMatchesHeader, templateColumns } from './header'
import { resolveLocales } from './locales'
import { buildExportTable, glyphFileName, sanitizeFileName, smartFileName, type ExportBuild, type ExportTranslations } from './rows'
import { collectionInfos, matchIds, selectSharedTable, uniqueLocales, type UnitySharedTable } from './unity-yaml'

/** 메인이 Unity 프로젝트 폴더를 읽은 결과 */
export type UnityScanResult =
  | { state: 'none' }
  | { state: 'failed'; projectPath: string; reason: string }
  | { state: 'ok'; projectPath: string; locales: UnityLocaleInfo[]; tables: UnitySharedTable[]; notices: string[] }

/** 메인이 템플릿 파일의 헤더를 읽은 결과 */
export type TemplateReadResult =
  | { state: 'none' }
  | { state: 'failed'; path: string; reason: string }
  | { state: 'ok'; path: string; header: string[] }

export type ExportPlanInput = {
  config: ProjectConfig
  request: ExportRequest
  master: readonly MasterRow[]
  translations: ExportTranslations
  unity: UnityScanResult
  template: TemplateReadResult
}

export type ExportPlan = {
  headerSource: 'auto' | 'template'
  columns: ExportColumnView[]
  languages: ExportLanguageView[]
  unity: UnityView
  template: TemplateView
  problems: string[]
  warnings: string[]
  build: ExportBuild
  smart: SmartItem[]
  smartUnset: number
  /** 출력 파일 이름(확장자 제외) */
  baseName: string
  /** Unity CSV 파일 이름 */
  mainFile: string
  /** Smart 항목 파일. Smart 항목이 없으면 null */
  smartFile: string | null
  /** 글자 목록 파일(옵션을 켰을 때) */
  glyphFiles: { language: string; name: string }[]
  /** 쓸 파일 이름 전부(위 셋을 이 순서로) */
  files: string[]
}

/** 고른 언어를 프로젝트 언어 순서(원문 → 대상)로 맞춘다. 프로젝트 언어가 아닌 코드는 뺀다. */
export function exportLanguages(config: ProjectConfig, requested: readonly string[]): string[] {
  const wanted = new Set(requested)
  return [config.sourceLanguage, ...config.targetLanguages].filter((language) => wanted.has(language))
}

/** 템플릿 매핑: 저장된 매핑이 헤더와 같으면 그것, 아니면 다시 추론한다. */
function templateMapping(
  saved: readonly TemplateColumn[],
  header: readonly string[],
  allLocales: readonly ExportLanguageView[]
): { columns: TemplateColumn[]; reinferred: boolean } {
  if (saved.length > 0 && mappingMatchesHeader(saved, header)) return { columns: [...saved], reinferred: false }
  return { columns: inferTemplateColumns(header, allLocales), reinferred: saved.length > 0 }
}

export function planExport(input: ExportPlanInput): ExportPlan {
  const { config, request, master, translations } = input
  const problems: string[] = []
  const warnings: string[] = []

  // Unity: 로케일과 공유 데이터
  const scan = input.unity
  const unityLocales = scan.state === 'ok' ? uniqueLocales(scan.locales) : null
  if (scan.state === 'failed') warnings.push(`Unity 프로젝트를 읽지 못해 기본 자동 생성으로 내보냅니다: ${scan.reason}`)

  const allLanguages = [config.sourceLanguage, ...config.targetLanguages]
  const languages = exportLanguages(config, request.languages)
  if (languages.length === 0) problems.push('내보낼 언어를 고르세요.')

  // 템플릿 추론은 프로젝트 언어 전체로, 헤더는 고른 언어로 만든다
  const all = resolveLocales(allLanguages, config.sourceLanguage, config.export.locales, unityLocales)
  const resolved = resolveLocales(languages, config.sourceLanguage, config.export.locales, unityLocales)
  const locales = resolved.locales
  const chosen = new Set(languages)
  warnings.push(...resolved.warnings)

  // 헤더: 템플릿을 읽었으면 템플릿, 아니면 자동 생성
  const options = { sharedComments: request.sharedComments, localeComments: request.localeComments }
  let headerSource: ExportPlan['headerSource'] = 'auto'
  let columns = autoColumns(locales, options)
  let template: TemplateView = { state: 'none' }
  const read = input.template
  if (read.state === 'failed') {
    template = read
    warnings.push(`템플릿을 읽지 못해 자동 생성 헤더를 씁니다: ${read.reason}`)
  } else if (read.state === 'ok') {
    const mapping = templateMapping(config.export.template?.columns ?? [], read.header, all.locales)
    template = { state: 'ok', path: read.path, header: read.header, columns: mapping.columns, reinferred: mapping.reinferred }
    if (mapping.reinferred) warnings.push('템플릿 헤더가 저장된 매핑과 달라 열 역할을 다시 추론했습니다. 확인한 뒤 매핑을 저장하세요.')
    const omitted = mapping.columns.filter((column) => column.role === 'omit').map((column) => column.name)
    if (omitted.length > 0) warnings.push(`템플릿 열 ${omitted.length}개는 내보내지 않습니다: ${omitted.join(', ')}`)
    headerSource = 'template'
    columns = templateColumns(mapping.columns, chosen, options)
    const mapped = new Set(columns.filter((column) => column.role === 'value').map((column) => column.language))
    const unmapped = languages.filter((language) => !mapped.has(language))
    if (unmapped.length > 0) warnings.push(`템플릿에 값 열이 없어 내보내지 않는 언어: ${unmapped.join(', ')}`)
  }
  problems.push(...columnProblems(columns))
  if (master.length === 0) problems.push('원문이 없습니다.')

  // Id: 고른 컬렉션의 공유 데이터
  let tableName: string | null = null
  let ids = new Map<string, string>()
  const notices: string[] = scan.state === 'ok' ? [...scan.notices] : []
  if (scan.state === 'ok') {
    const selection = selectSharedTable(scan.tables, config.export.unity?.tableCollection ?? '')
    if (selection.kind === 'selected') {
      tableName = selection.table.collection
      ids = matchIds(selection.table, master.map((row) => row.key)).ids
    } else if (selection.kind === 'choose') {
      notices.push('String Table 컬렉션이 여럿입니다. 하나를 고르면 기존 키의 Id 를 채웁니다.')
    } else if (selection.kind === 'missing') {
      notices.push(`고른 컬렉션 "${selection.name}" 을 찾지 못했습니다. Id 를 비웁니다.`)
    } else {
      notices.push('String Table 공유 데이터 에셋을 찾지 못했습니다. Id 를 비웁니다.')
    }
  }

  const build = buildExportTable({
    master,
    sourceLanguage: config.sourceLanguage,
    translations,
    columns,
    missing: request.missing,
    ids
  })

  let unity: UnityView = { state: 'none' }
  if (scan.state === 'failed') unity = scan
  if (scan.state === 'ok') {
    const selected = scan.tables.find((table) => table.collection === tableName)
    const counts = selected ? matchIds(selected, build.keys) : { idFound: 0, newKeys: build.keys.length, unityOnlyKeys: 0 }
    unity = {
      state: 'ok',
      projectPath: scan.projectPath,
      collections: collectionInfos(scan.tables),
      tableCollection: tableName,
      locales: unityLocales ?? [],
      idFound: counts.idFound,
      newKeys: counts.newKeys,
      unityOnlyKeys: counts.unityOnlyKeys,
      notices
    }
  }

  // Smart 항목: 내보내는 행 중 smart=true
  const syntax: SmartSyntax = config.smartStrings
  const exported = new Set(build.keys)
  const smart: SmartItem[] = []
  let smartUnset = 0
  for (const row of master) {
    if (!exported.has(row.key)) continue
    if (parseSmartFlag(row.smart) === true) smart.push({ key: row.key, id: ids.get(row.key) ?? '', source: row.source })
    else if (needsSmartSuggestion(row, syntax)) smartUnset += 1
  }

  const baseName = sanitizeFileName(request.fileName.trim() || tableName || config.name, 'strings')
  const mainFile = `${baseName}.csv`
  const smartFile = smart.length > 0 ? smartFileName(baseName) : null
  const glyphFiles = (request.glyphs ? valueLanguages(columns) : []).map((language) => ({ language, name: glyphFileName(baseName, language) }))
  const files = [mainFile, ...(smartFile ? [smartFile] : []), ...glyphFiles.map((file) => file.name)]

  return {
    headerSource,
    columns,
    languages: locales,
    unity,
    template,
    problems,
    warnings,
    build,
    smart,
    smartUnset,
    baseName,
    mainFile,
    smartFile,
    glyphFiles,
    files
  }
}

/** 값 열의 언어(열 순서) */
function valueLanguages(columns: readonly ExportColumnView[]): string[] {
  const languages: string[] = []
  for (const column of columns) {
    if (column.role === 'value' && column.language !== null && !languages.includes(column.language)) languages.push(column.language)
  }
  return languages
}

/** Smart 항목 파일의 표 */
export function smartTable(items: readonly SmartItem[]): { header: string[]; rows: string[][] } {
  return { header: [KEY_COLUMN, ID_COLUMN], rows: items.map((item) => [item.key, item.id]) }
}

/** 언어마다 그 값 열에 쓴 글자 목록 */
export function glyphsByLanguage(plan: Pick<ExportPlan, 'columns' | 'build'>, syntax: SmartSyntax): Map<string, string> {
  const result = new Map<string, string>()
  for (const language of valueLanguages(plan.columns)) {
    const index = plan.columns.findIndex((column) => column.role === 'value' && column.language === language)
    result.set(language, collectGlyphs(plan.build.rows.map((row) => row[index] ?? ''), syntax))
  }
  return result
}
