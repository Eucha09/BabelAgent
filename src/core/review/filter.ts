import type { TranslationStatus } from '@shared/schema/project'
import type { QaDiagnostic, QaRuleId } from '@shared/schema/qa'

/** 검토 화면의 빠른 필터. 상태·진단 종류·검색과 AND 로 묶인다. */
export type QuickFilter = 'all' | 'needs-review' | 'low-confidence' | 'qa-error' | 'stale'

export const QUICK_FILTERS: readonly QuickFilter[] = ['all', 'needs-review', 'low-confidence', 'qa-error', 'stale']

export type ReviewItem = {
  key: string
  source: string
  translation: string
  status: TranslationStatus
  confidence: string
  note: string
  diagnostics: readonly QaDiagnostic[]
}

export type ReviewFilter = {
  quick: QuickFilter
  status: TranslationStatus | null
  ruleId: QaRuleId | null
  search: string
}

/** 에이전트가 보고한 신뢰도. 비었거나 숫자가 아니면 null(사람이 쓴 번역). */
export function parseConfidence(raw: string): number | null {
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * - 검토 필요: 번역은 있고 승인 전(draft, review)
 * - 신뢰도 낮음: 승인 전이고 신뢰도가 기준 미만. 승인한 행은 이미 사람이 본 것이라 뺀다
 * - QA 오류: 오류 심각도 진단이 있음
 * - stale: 상태가 stale 이거나 해시가 맞지 않아 status.stale 진단이 붙음
 */
export function matchesQuick(item: ReviewItem, quick: QuickFilter, lowConfidenceBelow: number): boolean {
  switch (quick) {
    case 'all':
      return true
    case 'needs-review':
      return item.status === 'draft' || item.status === 'review'
    case 'low-confidence': {
      if (item.status === 'approved' || item.status === 'untranslated') return false
      const confidence = parseConfidence(item.confidence)
      return confidence !== null && confidence < lowConfidenceBelow
    }
    case 'qa-error':
      return item.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
    case 'stale':
      return item.status === 'stale' || item.diagnostics.some((diagnostic) => diagnostic.ruleId === 'status.stale')
  }
}

function matchesSearch(item: ReviewItem, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (needle === '') return true
  return [item.key, item.source, item.translation, item.note].some((field) => field.toLowerCase().includes(needle))
}

export function matchesFilter(item: ReviewItem, filter: ReviewFilter, lowConfidenceBelow: number): boolean {
  if (!matchesQuick(item, filter.quick, lowConfidenceBelow)) return false
  if (filter.status !== null && item.status !== filter.status) return false
  if (filter.ruleId !== null && !item.diagnostics.some((diagnostic) => diagnostic.ruleId === filter.ruleId)) return false
  return matchesSearch(item, filter.search)
}

export function filterItems<T extends ReviewItem>(items: readonly T[], filter: ReviewFilter, lowConfidenceBelow: number): T[] {
  return items.filter((item) => matchesFilter(item, filter, lowConfidenceBelow))
}

/** 빠른 필터별 행 수. 칩에 붙인다. */
export function countQuick(items: readonly ReviewItem[], lowConfidenceBelow: number): Record<QuickFilter, number> {
  const counts: Record<QuickFilter, number> = { all: 0, 'needs-review': 0, 'low-confidence': 0, 'qa-error': 0, stale: 0 }
  for (const item of items) {
    for (const quick of QUICK_FILTERS) {
      if (matchesQuick(item, quick, lowConfidenceBelow)) counts[quick] += 1
    }
  }
  return counts
}

/** 지금 행들에 실제로 나온 진단 종류. 진단 종류 선택 목록에 쓴다. */
export function presentRuleIds(items: readonly ReviewItem[]): QaRuleId[] {
  const seen = new Set<QaRuleId>()
  for (const item of items) for (const diagnostic of item.diagnostics) seen.add(diagnostic.ruleId)
  return [...seen].sort()
}
