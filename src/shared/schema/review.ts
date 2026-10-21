import { z } from 'zod'
import type { BulkApproveBlocker } from '@core/review/bulk'
import { TranslationStatus } from './project'
import type { QaDiagnostic } from './qa'
import type { StringsRow } from './strings'

/** 검토 화면에서 행 하나를 고친다(번역문·상태·메모). 저장은 행 단위로 바로 한다. */
export const UpdateTranslationInput = z.object({
  language: z.string().min(1),
  key: z.string().min(1),
  text: z.string(),
  status: TranslationStatus,
  /** 없으면 기존 메모를 둔다. */
  note: z.string().optional(),
  /** 재번역 후보를 적용할 때 에이전트의 신뢰도. 없으면 글이 바뀔 때 비운다. */
  confidence: z.string().optional(),
  /** 편집을 시작할 때 본 행. 디스크의 행이 이와 다르면 충돌로 돌려준다. */
  expected: z.object({ text: z.string(), status: TranslationStatus }),
  /** 충돌을 확인하고도 덮어쓰기로 했는지 */
  force: z.boolean()
})
export type UpdateTranslationInput = z.infer<typeof UpdateTranslationInput>

export type ReviewRowState = Pick<StringsRow, 'key' | 'translation' | 'status' | 'confidence' | 'note' | 'source_snapshot'>

export type UpdateTranslationResult = {
  row: ReviewRowState
  /** 저장한 행의 QA 진단 */
  diagnostics: QaDiagnostic[]
}

/**
 * 조건을 만족하는 초안을 한 번에 승인한다. 화면이 고른 대상과 그때 본 행을 보내면
 * 메인이 기록 직전에 파일을 다시 읽어 조건을 다시 확인하고, 통과한 행만 한 번에 쓴다.
 */
export const BulkApproveInput = z.object({
  language: z.string().min(1),
  rows: z
    .array(
      z.object({
        key: z.string().min(1),
        expected: z.object({ text: z.string(), status: TranslationStatus })
      })
    )
    .min(1)
})
export type BulkApproveInput = z.infer<typeof BulkApproveInput>

/**
 * 일괄 승인에서 뺀 이유. core/review/bulk.ts 의 이유에 메인이 다시 읽을 때 생기는 이유를 더한다.
 * - changed: 화면이 본 뒤 그 행이 바뀌었음(번역 작업 기록, 앱 밖 편집)
 * - missing: 원문이나 번역 파일에 그 키가 없음
 */
export type BulkApproveSkipReason = BulkApproveBlocker | 'changed' | 'missing'

export type BulkApproveResult = {
  approved: string[]
  skipped: { key: string; reason: BulkApproveSkipReason }[]
}

/** 행 하나 재번역. 결과는 쓰지 않고 후보로 돌려준다. */
export const RerollInput = z.object({
  requestId: z.string().min(1),
  language: z.string().min(1),
  key: z.string().min(1),
  instruction: z.string().max(2000)
})
export type RerollInput = z.infer<typeof RerollInput>

export const RerollCancelInput = z.object({ requestId: z.string().min(1) })
export type RerollCancelInput = z.infer<typeof RerollCancelInput>

export type RerollCandidate = {
  requestId: string
  language: string
  key: string
  text: string
  confidence: number
  note: string
  /** 후보를 적용했을 때의 QA 진단 */
  diagnostics: QaDiagnostic[]
  /** 요청할 때 쓴 지시. 후보 목록에 같이 보여 준다. */
  instruction: string
}
