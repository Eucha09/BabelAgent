import type { ExportLocale, ExportSettings, ExportSettingsPatch } from '@shared/schema/export'
import {
  MAX_CONCURRENCY,
  ProjectConfig,
  type ProjectSettingsPatch,
  type StyleRule
} from '@shared/schema/project'

/**
 * project.json 에 화면에서 고친 값을 합친다. 묶음(game, batch …) 안에서는 패치에 있는 항목만 바꾸고,
 * 배열(대상 언어, 스타일 규칙)은 통째로 바꾼다. 패치에 없는 묶음은 그대로 둔다.
 */
export function applySettingsPatch(config: ProjectConfig, patch: ProjectSettingsPatch): ProjectConfig {
  return {
    ...config,
    ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
    ...(patch.sourceLanguage === undefined ? {} : { sourceLanguage: patch.sourceLanguage.trim() }),
    ...(patch.targetLanguages === undefined ? {} : { targetLanguages: patch.targetLanguages.map((code) => code.trim()) }),
    ...(patch.styleRules === undefined ? {} : { styleRules: patch.styleRules }),
    game: { ...config.game, ...patch.game },
    batch: { ...config.batch, ...patch.batch },
    translate: { ...config.translate, ...patch.translate },
    review: { ...config.review, ...patch.review },
    context: { ...config.context, ...patch.context },
    smartStrings: { ...config.smartStrings, ...patch.smartStrings },
    export: applyExportPatch(config.export, patch.export)
  }
}

/** 로케일 칸의 앞뒤 공백을 지우고, 두 칸이 다 빈 언어는 뺀다(자동과 같다). */
export function normalizeExportLocales(locales: Readonly<Record<string, ExportLocale>>): Record<string, ExportLocale> {
  const result: Record<string, ExportLocale> = {}
  for (const [language, locale] of Object.entries(locales)) {
    const unityLocaleCode = locale.unityLocaleCode.trim()
    const columnName = locale.columnName.trim()
    if (unityLocaleCode !== '' || columnName !== '') result[language] = { unityLocaleCode, columnName }
  }
  return result
}

/** 템플릿 매핑은 등록된 템플릿이 있을 때만 바꾼다. 경로(unity, template.path)는 여기서 바꾸지 않는다. */
function applyExportPatch(current: ExportSettings, patch: ExportSettingsPatch | undefined): ExportSettings {
  if (!patch) return current
  const { locales, templateColumns, fileName, ...options } = patch
  return {
    ...current,
    ...options,
    ...(locales === undefined ? {} : { locales: normalizeExportLocales(locales) }),
    ...(fileName === undefined ? {} : { fileName: fileName.trim() }),
    template: current.template && templateColumns ? { ...current.template, columns: templateColumns } : current.template
  }
}

/** 스키마 순서로 맞춘 뒤 비교한다. 같으면 파일을 다시 쓰지 않는다. */
export function settingsChanged(before: ProjectConfig, after: ProjectConfig): boolean {
  return JSON.stringify(ProjectConfig.parse(before)) !== JSON.stringify(ProjectConfig.parse(after))
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * 화면이 고친 설정에서 바뀐 묶음만 골라 패치로 만든다. 저장하는 사이 앱 밖에서 다른 묶음을 고쳤다면
 * 그 변경은 메인이 합칠 때 그대로 남는다.
 */
export function buildSettingsPatch(base: ProjectConfig, next: ProjectConfig): ProjectSettingsPatch {
  const patch: ProjectSettingsPatch = {}
  if (base.name !== next.name) patch.name = next.name
  if (base.sourceLanguage !== next.sourceLanguage) patch.sourceLanguage = next.sourceLanguage
  if (!same(base.targetLanguages, next.targetLanguages)) patch.targetLanguages = next.targetLanguages
  if (!same(base.game, next.game)) patch.game = next.game
  if (!same(base.styleRules, next.styleRules)) patch.styleRules = next.styleRules
  if (!same(base.batch, next.batch)) patch.batch = next.batch
  if (!same(base.translate, next.translate)) patch.translate = next.translate
  if (!same(base.review, next.review)) patch.review = next.review
  if (!same(base.context, next.context)) patch.context = next.context
  if (!same(base.smartStrings, next.smartStrings)) patch.smartStrings = next.smartStrings
  // 프로젝트 화면은 내보내기 중 언어별 로케일만 고친다
  const locales = normalizeExportLocales(next.export.locales)
  if (!same(normalizeExportLocales(base.export.locales), locales)) patch.export = { locales }
  return patch
}

/** BCP 47 언어 태그인지(`ko`, `en`, `zh-Hans`, `pt-BR`). */
export function isLanguageTag(code: string): boolean {
  if (code.trim() === '' || code !== code.trim()) return false
  try {
    return Intl.getCanonicalLocales(code).length === 1
  } catch {
    return false
  }
}

function sameLanguage(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** 화면에서 칸 옆에 오류를 띄우는 단위 */
export type SettingsField =
  | 'name'
  | 'sourceLanguage'
  | 'targetLanguages'
  | 'styleRules'
  | 'batch.maxRows'
  | 'batch.maxSourceChars'
  | 'batch.concurrency'
  | 'review.lowConfidence'
  | 'context.maxLenRatio'
  | 'smartStrings.escapeChar'
  | 'smartStrings.formatters'
  | 'export.locales'

export type SettingsProblem = { field: SettingsField; message: string }

const FORMATTER_NAME = /^[A-Za-z0-9_]+$/

/** Unity 로케일 코드. Unity 는 사용자 정의 코드도 받으므로 BCP 47 보다 느슨하게 본다. */
const LOCALE_CODE = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/

/** Unity CSV 의 Key·Id·Shared Comments 열 이름. 로케일 열 이름으로 쓸 수 없다. */
export const RESERVED_COLUMN_NAMES: readonly string[] = ['Key', 'Id', 'Shared Comments']

/** max_len 배수의 상한. 이보다 크면 길이 제한이 사실상 없다. */
export const MAX_LEN_RATIO_LIMIT = 10

/**
 * 저장하기 전에 사람이 고칠 수 있는 문제를 모은다. 화면이 칸마다 보여 주고, 메인이 저장 직전에 한 번 더 본다.
 * 스키마(zod)가 형식을 보고, 여기서는 값의 뜻을 본다.
 */
export function validateProjectSettings(config: ProjectConfig): SettingsProblem[] {
  const problems: SettingsProblem[] = []
  const add = (field: SettingsField, message: string): void => {
    problems.push({ field, message })
  }

  if (config.name.trim() === '') add('name', '프로젝트 이름을 입력하세요.')

  if (!isLanguageTag(config.sourceLanguage)) add('sourceLanguage', `언어 코드가 아닙니다: "${config.sourceLanguage}"`)

  const invalid = config.targetLanguages.filter((code) => !isLanguageTag(code))
  if (invalid.length > 0) add('targetLanguages', `언어 코드가 아닙니다: ${invalid.join(', ')}`)
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const code of config.targetLanguages) {
    const lower = code.toLowerCase()
    if (seen.has(lower)) duplicates.add(code)
    seen.add(lower)
  }
  if (duplicates.size > 0) add('targetLanguages', `중복된 언어: ${[...duplicates].join(', ')}`)
  if (config.targetLanguages.some((code) => sameLanguage(code, config.sourceLanguage))) {
    add('targetLanguages', '원문 언어를 대상 언어로 둘 수 없습니다.')
  }

  if (config.styleRules.some((rule) => rule.text.trim() === '')) {
    add('styleRules', '비어 있는 규칙이 있습니다. 내용을 쓰거나 지우세요.')
  }
  if (new Set(config.styleRules.map((rule) => rule.id)).size !== config.styleRules.length) {
    add('styleRules', '규칙 id 가 겹칩니다.')
  }

  const { maxRows, maxSourceChars, concurrency } = config.batch
  if (!Number.isInteger(maxRows) || maxRows < 1) add('batch.maxRows', '1 이상의 정수를 입력하세요.')
  if (!Number.isInteger(maxSourceChars) || maxSourceChars < 1) add('batch.maxSourceChars', '1 이상의 정수를 입력하세요.')
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    add('batch.concurrency', `1~${MAX_CONCURRENCY} 사이의 정수를 입력하세요.`)
  }

  const low = config.review.lowConfidence
  if (!Number.isFinite(low) || low < 0 || low > 1) add('review.lowConfidence', '0~1 사이의 숫자를 입력하세요.')

  const ratio = config.context.maxLenRatio
  if (!Number.isFinite(ratio) || ratio < 1 || ratio > MAX_LEN_RATIO_LIMIT) {
    add('context.maxLenRatio', `1~${MAX_LEN_RATIO_LIMIT} 사이의 숫자를 입력하세요.`)
  }

  const { escapeChar, formatters } = config.smartStrings
  if ([...escapeChar].length !== 1) add('smartStrings.escapeChar', '글자 하나를 입력하세요.')
  else if (escapeChar === '{' || escapeChar === '}') add('smartStrings.escapeChar', '중괄호는 이스케이프 문자로 쓸 수 없습니다.')
  const badNames = formatters.filter((name) => !FORMATTER_NAME.test(name))
  if (badNames.length > 0) add('smartStrings.formatters', `포매터 이름은 영문·숫자·_ 만 씁니다: ${badNames.join(', ')}`)

  for (const message of exportLocaleProblems(config)) add('export.locales', message)

  return problems
}

/** 프로젝트 언어(원문 + 대상)의 내보내기 로케일 칸. 목록에서 빠진 언어의 값은 보지 않는다. */
function exportLocaleProblems(config: ProjectConfig): string[] {
  const messages: string[] = []
  const languages = [config.sourceLanguage, ...config.targetLanguages]
  const names = new Map<string, string>()
  for (const language of languages) {
    const locale = config.export.locales[language]
    if (!locale) continue
    const code = locale.unityLocaleCode
    if (code !== '' && !LOCALE_CODE.test(code)) messages.push(`${language}: 로케일 코드가 올바르지 않습니다: "${code}"`)
    const name = locale.columnName
    if (name === '') continue
    if (name !== name.trim() || /[\r\n]/.test(name)) messages.push(`${language}: 열 이름 앞뒤에 공백이나 줄바꿈을 둘 수 없습니다.`)
    else if (RESERVED_COLUMN_NAMES.includes(name)) messages.push(`${language}: "${name}" 은 Unity 가 쓰는 열 이름입니다.`)
    const other = names.get(name)
    if (other !== undefined) messages.push(`${other}·${language}: 열 이름 "${name}" 이 겹칩니다.`)
    names.set(name, language)
  }
  return messages
}

/**
 * 새 스타일 규칙의 id. 프롬프트는 규칙을 id 순으로 넣으므로(캐싱) 한 번 정한 id 는 바꾸지 않는다.
 * `r` + 숫자 중 가장 큰 수 + 1.
 */
export function nextStyleRuleId(rules: readonly StyleRule[]): string {
  let max = 0
  for (const rule of rules) {
    const match = /^r(\d+)$/.exec(rule.id)
    if (match?.[1]) max = Math.max(max, Number.parseInt(match[1], 10))
  }
  return `r${max + 1}`
}
