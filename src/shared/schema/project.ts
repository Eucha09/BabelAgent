import { z } from 'zod'
import { DEFAULT_SMART_FORMATTERS } from '@core/qa/formatters'
import { TranslateEffort, TranslateModel } from './jobs'

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

/**
 * 번역 모델과 사고 수준. 배치 번역과 행 재번역이 쓴다. 번역 화면과 설정 화면이 같은 값을 고친다.
 * 값이 빠진 옛 project.json 도 열리도록 필드마다 기본값을 둔다.
 */
export const TranslateSettings = z.object({
  model: TranslateModel.default('opus'),
  effort: TranslateEffort.default('medium')
})
export type TranslateSettings = z.infer<typeof TranslateSettings>
const DEFAULT_TRANSLATE: TranslateSettings = { model: 'opus', effort: 'medium' }

/** 검토 화면 설정. 신뢰도가 이 값보다 낮은 행을 "신뢰도 낮음" 필터로 모은다. */
const ReviewSettings = z.object({ lowConfidence: z.number().min(0).max(1) })
const DEFAULT_REVIEW: z.infer<typeof ReviewSettings> = { lowConfidence: 0.7 }

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
  export: ExportSettings.default(DEFAULT_EXPORT),
  translate: TranslateSettings.default(DEFAULT_TRANSLATE),
  review: ReviewSettings.default(DEFAULT_REVIEW)
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
    export: { ...DEFAULT_EXPORT },
    translate: { ...DEFAULT_TRANSLATE },
    review: { ...DEFAULT_REVIEW }
  }
}

/**
 * project.json 부분 갱신(렌더러 → 메인). 화면에서 고칠 수 있는 항목만 받는다.
 * 지금은 번역 모델·사고 수준뿐이다.
 */
export const ProjectSettingsPatch = z.object({
  translate: z.object({ model: TranslateModel, effort: TranslateEffort }).partial().optional()
})
export type ProjectSettingsPatch = z.infer<typeof ProjectSettingsPatch>

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
