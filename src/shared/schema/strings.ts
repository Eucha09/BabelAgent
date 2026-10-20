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
  tags: z.string(),
  source_hash: z.string()
})
export type MasterRow = z.infer<typeof MasterRow>

export const TRANSLATION_COLUMNS = [
  'key',
  'text',
  'source_hash',
  'status',
  'confidence',
  'note'
] as const

export const TranslationRow = z.object({
  key: z.string(),
  text: z.string(),
  source_hash: z.string(),
  status: TranslationStatus,
  confidence: z.string(),
  note: z.string()
})
export type TranslationRow = z.infer<typeof TranslationRow>

/** 그리드 한 줄. 원문과 선택한 언어의 번역을 합쳐 둔 값. */
export type StringsRow = MasterRow & {
  translation: string
  status: TranslationStatus
  confidence: string
  note: string
}

export type EncodingNotice = { file: string; encoding: 'utf8' | 'cp949' }

export type StringsView = {
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
  /** 충돌을 확인하고도 덮어쓰기로 결정했는지. */
  force: z.boolean()
})
export type SaveStringsInput = z.infer<typeof SaveStringsInput>

/** 외부 CSV의 열 이름을 strings_master 열에 연결한다. 빈 문자열은 "매핑 안 함". */
export const ColumnMapping = z.object({
  key: z.string().min(1),
  source: z.string().min(1),
  context: z.string(),
  ui_type: z.string(),
  max_len: z.string(),
  vars: z.string(),
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
