import { z } from 'zod'
import type { QaRuleId } from './qa'

/** 번역 없음·stale 칸 처리. docs/unity-export.md "행 생성". */
export const ExportMissing = z.enum(['empty', 'source', 'skip'])
export type ExportMissing = z.infer<typeof ExportMissing>

/** 언어 하나의 Unity 로케일 설정. 빈 값은 자동(로케일 코드 → 프로젝트 언어 코드 또는 Unity 로케일, 열 이름 → 이름표). */
export const ExportLocale = z.object({
  unityLocaleCode: z.string().default(''),
  columnName: z.string().default('')
})
export type ExportLocale = z.infer<typeof ExportLocale>

/**
 * 템플릿 열의 역할. omit 은 내보내지 않는 열이다 — 빈 칸으로 두면 Unity 가 그 열의 기존 값을 지운다.
 * value·comments 는 language(프로젝트 언어 코드)와 함께 쓴다.
 */
export const TemplateColumnRole = z.enum(['key', 'id', 'sharedComments', 'value', 'comments', 'omit'])
export type TemplateColumnRole = z.infer<typeof TemplateColumnRole>

export const TemplateColumn = z.object({
  name: z.string(),
  role: TemplateColumnRole,
  language: z.string().default('')
})
export type TemplateColumn = z.infer<typeof TemplateColumn>

export const ExportTemplate = z.object({
  /** 프로젝트 폴더 기준 상대 경로 */
  path: z.string().min(1),
  /** 저장된 열 매핑. 템플릿 헤더와 이름·순서가 다르면 다시 추론한다. */
  columns: z.array(TemplateColumn).default([])
})
export type ExportTemplate = z.infer<typeof ExportTemplate>

export const UnityLink = z.object({
  /** Unity 프로젝트 폴더. 프로젝트 폴더 기준 상대 경로(드라이브가 다르면 절대 경로). */
  projectPath: z.string().min(1),
  /** 고른 String Table 컬렉션 이름(m_TableCollectionName). 빈 값이면 하나뿐일 때 그것을 쓴다. */
  tableCollection: z.string().default('')
})
export type UnityLink = z.infer<typeof UnityLink>

const ExportSettingsObject = z.object({
  /** 프로젝트 언어 코드 → Unity 로케일 설정 */
  locales: z.record(z.string(), ExportLocale).default({}),
  /** Shared Comments 열을 만들고 context 를 넣는다 */
  sharedComments: z.boolean().default(false),
  /** 언어별 "… Comments" 열을 만들고 번역 메모(note)를 넣는다 */
  localeComments: z.boolean().default(false),
  missing: ExportMissing.default('empty'),
  /** 언어별 글자 목록 파일도 쓴다 */
  glyphs: z.boolean().default(false),
  /** 출력 파일 이름(확장자 제외). 빈 값이면 컬렉션 이름 → 프로젝트 이름 */
  fileName: z.string().default(''),
  unity: UnityLink.nullable().default(null),
  template: ExportTemplate.nullable().default(null)
})

/**
 * 옛 파일의 `unityTemplate`(템플릿이 필수이던 때의 경로 문자열)을 `template.path`로 옮긴다.
 * 매핑은 비워 두면 다음 미리보기에서 다시 추론한다.
 */
function upgradeLegacyExport(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || !('unityTemplate' in raw)) return raw
  const { unityTemplate, ...rest } = raw as Record<string, unknown>
  if ('template' in rest || typeof unityTemplate !== 'string' || unityTemplate.trim() === '') return rest
  return { ...rest, template: { path: unityTemplate, columns: [] } }
}

export const ExportSettings = z.preprocess(upgradeLegacyExport, ExportSettingsObject)
export type ExportSettings = z.infer<typeof ExportSettingsObject>

export const DEFAULT_EXPORT: ExportSettings = {
  locales: {},
  sharedComments: false,
  localeComments: false,
  missing: 'empty',
  glyphs: false,
  fileName: '',
  unity: null,
  template: null
}

/** project:settings:set 로 받는 내보내기 값. 경로(unity, template.path)는 대화상자 채널로만 바꾼다. */
export const ExportSettingsPatch = z
  .object({
    locales: z.record(z.string(), ExportLocale),
    sharedComments: z.boolean(),
    localeComments: z.boolean(),
    missing: ExportMissing,
    glyphs: z.boolean(),
    fileName: z.string(),
    /** 등록된 템플릿의 열 매핑. 템플릿이 없으면 무시한다. */
    templateColumns: z.array(TemplateColumn)
  })
  .partial()
export type ExportSettingsPatch = z.infer<typeof ExportSettingsPatch>

/** 내보내기 화면의 요청. 옵션은 화면이 project.json 에 따로 저장하고, 미리보기·쓰기는 요청 값을 쓴다. */
export const ExportRequest = z.object({
  /** 내보낼 언어(원문 언어 포함 가능). 프로젝트 언어가 아닌 코드는 무시한다. */
  languages: z.array(z.string()),
  sharedComments: z.boolean(),
  localeComments: z.boolean(),
  missing: ExportMissing,
  glyphs: z.boolean(),
  fileName: z.string()
})
export type ExportRequest = z.infer<typeof ExportRequest>

export const ExportRunInput = z.object({
  request: ExportRequest,
  /** 이미 있는 출력 파일을 덮어써도 되는지(화면이 목록을 보여 주고 확인받은 뒤 true) */
  overwrite: z.boolean()
})
export type ExportRunInput = z.infer<typeof ExportRunInput>

export const SelectCollectionInput = z.object({ tableCollection: z.string() })
export type SelectCollectionInput = z.infer<typeof SelectCollectionInput>

export type ExportColumnOrigin = 'auto' | 'setting' | 'unity' | 'template'

export type ExportColumnView = {
  name: string
  role: TemplateColumnRole
  /** value·comments 열의 프로젝트 언어 코드 */
  language: string | null
  origin: ExportColumnOrigin
}

export type UnityLocaleInfo = { code: string; name: string }

export type ExportLanguageView = {
  language: string
  isSource: boolean
  unityLocaleCode: string
  codeOrigin: 'project' | 'setting' | 'unity'
  columnName: string
  nameOrigin: 'auto' | 'setting'
  /** Unity 를 연결했을 때 맞춘 로케일. 못 찾았거나 연결하지 않았으면 null */
  unityLocale: UnityLocaleInfo | null
}

export type UnityCollectionInfo = { name: string; entries: number }

export type UnityView =
  | { state: 'none' }
  | {
      state: 'ok'
      projectPath: string
      collections: UnityCollectionInfo[]
      /** 쓰는 컬렉션. 여럿인데 고르지 않았으면 null */
      tableCollection: string | null
      locales: UnityLocaleInfo[]
      /** Id 를 찾은 키 수 */
      idFound: number
      /** Unity 에 없는 키 수(새 Id) */
      newKeys: number
      /** Unity 에만 있는 키 수. Import > CSV... 로 가져오면 지워진다 */
      unityOnlyKeys: number
      notices: string[]
    }
  | { state: 'failed'; projectPath: string; reason: string }

export type TemplateView =
  | { state: 'none' }
  | {
      state: 'ok'
      path: string
      header: string[]
      columns: TemplateColumn[]
      /** 저장된 매핑이 템플릿 헤더와 달라 다시 추론했는지 */
      reinferred: boolean
    }
  | { state: 'failed'; path: string; reason: string }

export type ExportQaItem = { language: string; key: string; ruleId: QaRuleId; message: string }

export type ExportLanguageSummary = {
  language: string
  /** 번역(원문 언어는 원문)을 넣은 칸 */
  filled: number
  /** 비운 칸 */
  blank: number
  /** 원문으로 채운 칸(missing = source) */
  sourceFilled: number
}

export type ExportSummary = {
  rows: number
  /** missing = skip 으로 뺀 행 수와 앞부분 키 */
  skippedRows: number
  skippedKeys: string[]
  languages: ExportLanguageSummary[]
}

export type SmartItem = { key: string; id: string; source: string }

export type ExportFile = { name: string; exists: boolean }

export type ExportPreview = {
  headerSource: 'auto' | 'template'
  columns: ExportColumnView[]
  /** 출력 앞부분 몇 행(헤더 순서). 열 이름과 값을 눈으로 확인하는 용도 */
  sampleRows: string[][]
  languages: ExportLanguageView[]
  unity: UnityView
  template: TemplateView
  /** 내보내기를 막는 문제(열 이름이 비거나 겹침, Key 열 없음, 원문 없음) */
  problems: string[]
  /** 막지 않는 알림(로케일을 못 찾음, 템플릿을 다시 추론함 등) */
  warnings: string[]
  qaErrors: ExportQaItem[]
  qaWarnings: number
  qaNotices: string[]
  summary: ExportSummary
  smart: SmartItem[]
  /** Smart 구문이 있는데 smart 가 비어 있는 행 수 */
  smartUnset: number
  /** 출력 폴더(프로젝트 폴더 기준) */
  outputDir: string
  files: ExportFile[]
  blocked: boolean
}

export type ExportResult = {
  outputDir: string
  files: string[]
  summary: ExportSummary
  smartCount: number
}
