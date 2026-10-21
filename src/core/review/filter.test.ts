import { describe, expect, it } from 'vitest'
import type { QaDiagnostic } from '@shared/schema/qa'
import { countQuick, filterItems, parseConfidence, presentRuleIds, type ReviewFilter, type ReviewItem } from './filter'

const error: QaDiagnostic = { ruleId: 'var.missing', severity: 'error', key: '', message: '', items: [] }
const staleWarning: QaDiagnostic = { ruleId: 'status.stale', severity: 'warning', key: '', message: '', items: [] }

function item(key: string, partial: Partial<ReviewItem> = {}): ReviewItem {
  return { key, source: `src ${key}`, translation: `tr ${key}`, status: 'draft', confidence: '', note: '', diagnostics: [], ...partial }
}

const items: ReviewItem[] = [
  item('untranslated', { status: 'untranslated', translation: '' }),
  item('draft-low', { confidence: '0.4' }),
  item('review-ok', { status: 'review', confidence: '0.95' }),
  item('approved-low', { status: 'approved', confidence: '0.3' }),
  item('stale', { status: 'stale', diagnostics: [staleWarning] }),
  item('hash-mismatch', { status: 'draft', diagnostics: [staleWarning] }),
  item('error', { status: 'approved', diagnostics: [error] })
]

const none: ReviewFilter = { quick: 'all', status: null, ruleId: null, search: '' }
const keys = (filter: Partial<ReviewFilter>): string[] => filterItems(items, { ...none, ...filter }, 0.7).map((row) => row.key)

describe('빠른 필터', () => {
  it('검토 필요 = draft + review', () => {
    expect(keys({ quick: 'needs-review' })).toEqual(['draft-low', 'review-ok', 'hash-mismatch'])
  })

  it('신뢰도 낮음은 승인 전 행만, 기준 미만', () => {
    expect(keys({ quick: 'low-confidence' })).toEqual(['draft-low'])
  })

  it('QA 오류', () => {
    expect(keys({ quick: 'qa-error' })).toEqual(['error'])
  })

  it('stale 은 상태 또는 해시 불일치 진단', () => {
    expect(keys({ quick: 'stale' })).toEqual(['stale', 'hash-mismatch'])
  })

  it('행 수', () => {
    expect(countQuick(items, 0.7)).toEqual({ all: 7, 'needs-review': 3, 'low-confidence': 1, 'qa-error': 1, stale: 2 })
  })
})

describe('조합', () => {
  it('상태 · 진단 종류 · 검색을 AND 로 묶는다', () => {
    expect(keys({ status: 'approved' })).toEqual(['approved-low', 'error'])
    expect(keys({ status: 'approved', ruleId: 'var.missing' })).toEqual(['error'])
    expect(keys({ quick: 'needs-review', search: 'REVIEW' })).toEqual(['review-ok'])
  })

  it('검색은 키·원문·번역·메모를 본다', () => {
    expect(filterItems([item('a', { note: '확인 필요' })], { ...none, search: '확인' }, 0.7)).toHaveLength(1)
  })
})

describe('보조 함수', () => {
  it('parseConfidence', () => {
    expect(parseConfidence('')).toBeNull()
    expect(parseConfidence('abc')).toBeNull()
    expect(parseConfidence('0.5')).toBe(0.5)
  })

  it('presentRuleIds', () => {
    expect(presentRuleIds(items)).toEqual(['status.stale', 'var.missing'])
  })
})
