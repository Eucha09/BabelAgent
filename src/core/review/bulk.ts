import type { ReviewItem } from './filter'
import { parseConfidence } from './filter'

/**
 * 일괄 승인에서 행을 빼는 이유. 화면이 대상을 고를 때와 메인이 기록 직전에 다시 확인할 때 같은 함수를 쓴다.
 * - not-draft: 초안이 아님(검토·승인·stale·미번역은 사람이 따로 본다)
 * - empty: 번역문이 비었음
 * - has-diagnostics: QA 오류나 경고가 하나라도 있음
 * - low-confidence: 신뢰도가 기준(review.lowConfidence) 미만
 */
export type BulkApproveBlocker = 'not-draft' | 'empty' | 'has-diagnostics' | 'low-confidence'

type BulkCandidate = Pick<ReviewItem, 'status' | 'translation' | 'confidence' | 'diagnostics'>

/**
 * 초안을 일괄 승인해도 되는지. 신뢰도가 비어 있으면(사람이 고친 초안) 낮은 것으로 보지 않는다 —
 * "신뢰도 낮음" 필터와 같은 기준이다.
 */
export function bulkApproveBlocker(item: BulkCandidate, lowConfidenceBelow: number): BulkApproveBlocker | null {
  if (item.status !== 'draft') return 'not-draft'
  if (item.translation.trim() === '') return 'empty'
  if (item.diagnostics.length > 0) return 'has-diagnostics'
  const confidence = parseConfidence(item.confidence)
  if (confidence !== null && confidence < lowConfidenceBelow) return 'low-confidence'
  return null
}

export function bulkApproveTargets<T extends BulkCandidate>(items: readonly T[], lowConfidenceBelow: number): T[] {
  return items.filter((item) => bulkApproveBlocker(item, lowConfidenceBelow) === null)
}
