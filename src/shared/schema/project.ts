import { z } from 'zod'
import { DEFAULT_SMART_FORMATTERS } from '@core/qa/formatters'

export { SUPPORTED_SCHEMA_VERSION } from '@core/project/schema-version'

/** 번역 상태값. 이 다섯 개 외에는 쓰지 않는다. */
export const TranslationStatus = z.enum(['untranslated', 'draft', 'review', 'approved', 'stale'])
export type TranslationStatus = z.infer<typeof TranslationStatus>

export const StyleRule = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  createdAt: z.string()
})
export type StyleRule = z.infer<typeof StyleRule>

const GameInfo = z.object({
  genre: z.string(),
  intro: z.string(),
  toneGuide: z.string()
})
const DEFAULT_GAME: z.infer<typeof GameInfo> = { genre: '', intro: '', toneGuide: '' }

const BatchSettings = z.object({
  maxRows: z.number().int().min(1),
  maxSourceChars: z.number().int().min(1),
  /** 상한 3. 더 큰 값은 스케줄러가 잘라낸다. */
  concurrency: z.number().int().min(1)
})
const DEFAULT_BATCH: z.infer<typeof BatchSettings> = {
  maxRows: 30,
  maxSourceChars: 3000,
  concurrency: 2
}
export const MAX_CONCURRENCY = 3

/** Unity SmartFormat 설정을 그대로 옮긴 값. 토크나이저와 QA가 이 값을 따른다. */
const SmartStringsSettings = z.object({
  enabled: z.boolean(),
  formatters: z.array(z.string().min(1)),
  alternativeEscaping: z.boolean(),
  escapeChar: z.string().length(1),
  convertCharacterStringLiterals: z.boolean(),
  caseSensitive: z.boolean()
})
const DEFAULT_SMART_STRINGS: z.infer<typeof SmartStringsSettings> = {
  enabled: true,
  formatters: [...DEFAULT_SMART_FORMATTERS],
  alternativeEscaping: false,
  escapeChar: '\\',
  convertCharacterStringLiterals: false,
  caseSensitive: true
}

const GrammarSettings = z.object({
  enabled: z.boolean(),
  tables: z.array(z.string().min(1))
})
const DEFAULT_GRAMMAR: z.infer<typeof GrammarSettings> = { enabled: false, tables: [] }

const ExportSettings = z.object({
  /** Unity에서 내보낸 샘플 CSV 경로(프로젝트 폴더 기준 상대 경로). */
  unityTemplate: z.string().nullable()
})
const DEFAULT_EXPORT: z.infer<typeof ExportSettings> = { unityTemplate: null }

export const ProjectConfig = z.object({
  schemaVersion: z.number().int().min(1),
  name: z.string().min(1),
  sourceLanguage: z.string().min(1),
  targetLanguages: z.array(z.string().min(1)).default([]),
  game: GameInfo.default(DEFAULT_GAME),
  styleRules: z.array(StyleRule).default([]),
  batch: BatchSettings.default(DEFAULT_BATCH),
  smartStrings: SmartStringsSettings.default(DEFAULT_SMART_STRINGS),
  grammar: GrammarSettings.default(DEFAULT_GRAMMAR),
  export: ExportSettings.default(DEFAULT_EXPORT)
})
export type ProjectConfig = z.infer<typeof ProjectConfig>

/** 새 프로젝트의 project.json 초기값. */
export function createDefaultProjectConfig(input: {
  name: string
  sourceLanguage: string
  targetLanguages: string[]
  schemaVersion: number
}): ProjectConfig {
  return {
    schemaVersion: input.schemaVersion,
    name: input.name,
    sourceLanguage: input.sourceLanguage,
    targetLanguages: input.targetLanguages,
    game: { ...DEFAULT_GAME },
    styleRules: [],
    batch: { ...DEFAULT_BATCH },
    smartStrings: { ...DEFAULT_SMART_STRINGS, formatters: [...DEFAULT_SMART_FORMATTERS] },
    grammar: { ...DEFAULT_GRAMMAR, tables: [] },
    export: { ...DEFAULT_EXPORT }
  }
}

/** 프로젝트 생성 요청(렌더러 → 메인). */
export const CreateProjectInput = z.object({
  dir: z.string().min(1),
  name: z.string().min(1),
  sourceLanguage: z.string().min(1),
  targetLanguages: z.array(z.string().min(1))
})
export type CreateProjectInput = z.infer<typeof CreateProjectInput>

export const OpenProjectInput = z.object({ dir: z.string().min(1) })
export type OpenProjectInput = z.infer<typeof OpenProjectInput>

export type OpenProject = {
  dir: string
  config: ProjectConfig
}
