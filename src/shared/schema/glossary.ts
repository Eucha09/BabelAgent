import { z } from 'zod'
import type { EncodingNotice } from './strings'

/** approved 만 번역 프롬프트와 QA 에 쓰인다. 에이전트가 낸 후보는 pending 으로 들어온다. */
export const GlossaryStatus = z.enum(['approved', 'pending'])
export type GlossaryStatus = z.infer<typeof GlossaryStatus>

/** glossary.csv 한 행을 화면에서 다루는 모양. 파일의 다른 열은 메인이 그대로 보존한다. */
export const GlossaryEntry = z.object({
  term: z.string(),
  /** 대상 언어 코드 → 확정 번역. 프로젝트의 대상 언어마다 키가 있다 */
  translations: z.record(z.string(), z.string()),
  pos: z.string(),
  /** 번역가에게 주는 사용 지침. 번역 프롬프트에 들어간다 */
  note: z.string(),
  strict: z.boolean(),
  status: GlossaryStatus,
  /**
   * 승인된 용어에서 아직 승인을 기다리는 언어. 용어 번역 작업이 승인된 용어의 빈 칸을 채우면 그 언어가 들어간다.
   * 이 언어의 번역은 승인 전까지 번역 프롬프트와 QA 에 쓰지 않는다. 승인 대기 용어에서는 쓰지 않는다(용어 전체가 대기)
   */
  pendingLanguages: z.array(z.string()),
  /** 에이전트가 후보로 낸 근거. 사람이 추가한 용어는 비어 있다 */
  reason: z.string(),
  /** 에이전트가 보고한 신뢰도(0~1). 사람이 추가한 용어는 비어 있다 */
  confidence: z.string()
})
export type GlossaryEntry = z.infer<typeof GlossaryEntry>

export type GlossaryView = {
  exists: boolean
  /** 파일 순서. 같은 용어(대소문자 무시)가 여러 행이면 첫 행만 담는다 */
  entries: GlossaryEntry[]
  languages: string[]
  /** 파일에서 겹친 용어. 첫 행만 화면에서 고칠 수 있다 */
  duplicates: string[]
  notices: EncodingNotice[]
}

/**
 * 용어 하나를 바꾸는 요청.
 * - original 이 null 이면 추가, next 가 null 이면 삭제
 * - expected 는 화면이 본 행. 디스크의 그 행이 다르면(추출 작업·앱 밖 편집) 덮지 않고 건너뛴다
 */
export const GlossaryChange = z.object({
  original: z.string().nullable(),
  next: GlossaryEntry.nullable(),
  expected: GlossaryEntry.nullable()
})
export type GlossaryChange = z.infer<typeof GlossaryChange>

export const UpdateGlossaryInput = z.object({ changes: z.array(GlossaryChange).min(1) })
export type UpdateGlossaryInput = z.infer<typeof UpdateGlossaryInput>

/** missing: 파일에 없음, changed: 화면이 본 뒤 바뀜, exists: 같은 용어가 이미 있음, invalid: 용어가 빔 */
export type GlossarySkipReason = 'missing' | 'changed' | 'exists' | 'invalid'

export type UpdateGlossaryResult = {
  view: GlossaryView
  /** 바꾼 용어(바뀐 뒤 이름) */
  applied: string[]
  skipped: { term: string; reason: GlossarySkipReason }[]
}

export const TermsScope = z.enum(['all', 'selected'])
export type TermsScope = z.infer<typeof TermsScope>

export const StartTermsInput = z.object({
  scope: TermsScope,
  /** scope 가 selected 일 때만 쓴다 */
  keys: z.array(z.string())
})
export type StartTermsInput = z.infer<typeof StartTermsInput>

/**
 * 용어 번역 작업. 고른 언어의 빈 칸만 채운다(덮어쓰기는 [선택 재번역]).
 * - scope all: 빈 칸이 있는 모든 용어, selected: terms 에 든 용어(용어집 그리드에서 고른 것)
 */
export const StartTermTranslateInput = z.object({
  languages: z.array(z.string().min(1)).min(1),
  scope: TermsScope,
  /** scope 가 selected 일 때만 쓴다 */
  terms: z.array(z.string())
})
export type StartTermTranslateInput = z.infer<typeof StartTermTranslateInput>

/**
 * 용어 하나를 에이전트로 채워 추가한다. 원문에서 그 용어가 쓰인 행을 코드가 찾아 예문으로 주고,
 * 에이전트가 대상 언어별 번역(비운 칸이면 품사·지침도)을 채운다. 결과는 승인 대기로 들어간다.
 */
export const AddTermInput = z.object({
  requestId: z.string().min(1),
  term: z.string().min(1).max(200),
  /** 비우면 에이전트가 채운다 */
  pos: z.string().max(100),
  note: z.string().max(1000),
  strict: z.boolean()
})
export type AddTermInput = z.infer<typeof AddTermInput>

/** 용어 추가·재번역 세션 취소 */
export const TermAgentCancelInput = z.object({ requestId: z.string().min(1) })
export type TermAgentCancelInput = z.infer<typeof TermAgentCancelInput>

/** 정한 번역과 다르게 옮긴 기존 번역 행. 이 용어를 승인하면 용어집 위반이 된다. */
export type TermConflict = { language: string; keys: string[] }

export type AddTermResult = {
  entry: GlossaryEntry
  /** 원문에서 이 용어가 나온 행 수 */
  found: number
  /** 예문으로 준 행 수 */
  examples: number
  conflicts: TermConflict[]
}

/**
 * 이미 있는 용어 하나를 다시 번역한다(용어집 화면의 [선택 재번역]). 결과는 쓰지 않고 돌려준다 —
 * 화면이 그 행의 칸에 미저장 편집으로 채우고, 사람이 [저장]해야 반영된다.
 * translations·pos·note 는 화면이 보고 있는 값(고친 칸 포함)이다. 번역과 지침을 다시 받고, 품사는 바꾸지 않는다.
 */
export const RetranslateTermInput = z.object({
  requestId: z.string().min(1),
  term: z.string().min(1).max(200),
  translations: z.record(z.string(), z.string()),
  pos: z.string().max(100),
  note: z.string().max(1000),
  instruction: z.string().max(2000)
})
export type RetranslateTermInput = z.infer<typeof RetranslateTermInput>

export type RetranslateTermResult = {
  term: string
  /** 대상 언어 → 새 번역 */
  translations: Record<string, string>
  /** 새 번역에 맞게 다시 쓴 사용 지침. 필요 없으면 빈 글자 */
  note: string
  reason: string
  confidence: number
  found: number
  examples: number
  conflicts: TermConflict[]
}
