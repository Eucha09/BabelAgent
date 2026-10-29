import { z } from 'zod'
import { TranslationStatus } from './project'

/** strings_master.csv 의 열. 순서가 곧 파일의 열 순서다. */
export const MASTER_COLUMNS = [
  'key',
  'source',
  'context',
  'ui_type',
  'max_len',
  'vars',
  'smart',
  'tags',
  'source_hash'
] as const

/** CSV는 전부 문자열이다. 모르는 값을 숫자로 바꾸지 않고 원본 그대로 들고 다닌다. */
export const MasterRow = z.object({
  key: z.string(),
  source: z.string(),
  context: z.string(),
  ui_type: z.string(),
  max_len: z.string(),
  vars: z.string(),
  /** Unity Smart String 여부. `true`/`false`(대소문자 무시), 그 밖의 값은 미정. 글자는 그대로 들고 다닌다. */
  smart: z.string(),
  tags: z.string(),
  source_hash: z.string()
})
export type MasterRow = z.infer<typeof MasterRow>

/**
 * vars 열의 한 항목. 변수 이름의 기준은 원문에서 재추출한 집합이고, 이 값은 의미를 알려 주는 메타데이터다.
 * example 은 숫자로 적혀 있어도 받는다(엑셀이 숫자로 바꿔 저장하는 경우).
 */
export const VarMeta = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  meaning: z.string().optional(),
  example: z.union([z.string(), z.number()]).transform(String).optional()
})
export type VarMeta = z.infer<typeof VarMeta>
export const VarsColumn = z.array(VarMeta)

export const TRANSLATION_COLUMNS = [
  'key',
  'text',
  'source_hash',
  'status',
  'confidence',
  'note',
  'source_snapshot'
] as const

export const TranslationRow = z.object({
  key: z.string(),
  text: z.string(),
  source_hash: z.string(),
  status: TranslationStatus,
  confidence: z.string(),
  note: z.string(),
  /**
   * 번역할 때 본 원문. 원문이 바뀌어 stale 이 되면 이전 원문과 새 원문을 비교해 보여 준다.
   * 이 열이 생기기 전에 쓴 번역은 비어 있다.
   */
  source_snapshot: z.string()
})
export type TranslationRow = z.infer<typeof TranslationRow>

/** 그리드 한 줄. 원문과 선택한 언어의 번역을 합쳐 둔 값. */
export type StringsRow = MasterRow & {
  translation: string
  status: TranslationStatus
  confidence: string
  note: string
  /** 번역할 때 본 원문. 번역 행의 해시와 맞지 않으면(밖에서 고친 경우) 믿을 수 없어 비운다. */
  source_snapshot: string
}

export type EncodingNotice = { file: string; encoding: 'utf8' | 'cp949' }

export type StringsView = {
  /** strings_master.csv 가 디스크에 있는지. 없으면 화면이 파일 만들기를 권한다. */
  masterExists: boolean
  rows: StringsRow[]
  /** 지금 보고 있는 대상 언어. 프로젝트에 대상 언어가 없으면 null. */
  language: string | null
  languages: string[]
  notices: EncodingNotice[]
}

export const StringsListInput = z.object({ language: z.string().nullable() })
export type StringsListInput = z.infer<typeof StringsListInput>

export const SaveStringsInput = z.object({
  rows: z.array(MasterRow),
  /**
   * 지울 키. 원문과 모든 번역 파일에서 그 행을 지운다.
   * "원문에서 빠진 키"로 추론하지 않고 명시한다 — 다른 경로의 실수가 번역 삭제로 번지지 않게.
   */
  deletedKeys: z.array(z.string()),
  /** 충돌을 확인하고도 덮어쓰기로 결정했는지. */
  force: z.boolean()
})
export type SaveStringsInput = z.infer<typeof SaveStringsInput>

export type SaveStringsResult = {
  staleMarked: number
  removedRows: number
  /** 번역 파일에서 함께 지운 행 수(모든 파일 합계). */
  removedTranslations: number
}

/** 외부 CSV의 열 이름을 strings_master 열에 연결한다. 빈 문자열은 "매핑 안 함". */
export const ColumnMapping = z.object({
  key: z.string().min(1),
  source: z.string().min(1),
  context: z.string(),
  ui_type: z.string(),
  max_len: z.string(),
  vars: z.string(),
  smart: z.string(),
  tags: z.string()
})
export type ColumnMapping = z.infer<typeof ColumnMapping>

export type ImportPreview = {
  filePath: string
  header: string[]
  sample: string[][]
  encoding: 'utf8' | 'cp949'
  /** 열 이름으로 자동 추측한 매핑. 사용자가 고칠 수 있다. */
  guess: ColumnMapping
}

export const ImportInput = z.object({
  filePath: z.string().min(1),
  mapping: ColumnMapping,
  force: z.boolean()
})
export type ImportInput = z.infer<typeof ImportInput>

export type ImportSummary = {
  added: number
  changed: number
  unchanged: number
  /** 기존에 있지만 이번 파일에는 없는 키. 지우지 않고 보고만 한다. */
  missing: string[]
  /** 가져온 파일 안에서 중복된 키. 첫 행만 쓴다. */
  duplicates: string[]
  emptyKeys: number
  /** 원문이 바뀌어 stale로 바뀐 번역 수(언어별 합). */
  staleMarked: number
}

/** 프로젝트 폴더에서 외부 변경이 감지됐을 때. */
export type FileChanged = { file: string }
