import { describe, expect, it } from 'vitest'
import type { QaDiagnostic } from '@shared/schema/qa'
import { bulkApproveBlocker, bulkApproveTargets } from './bulk'
import type { ReviewItem } from './filter'

const warning: QaDiagnostic = { ruleId: 'glossary.violation', severity: 'warning', key: '', message: '', items: [] }

function item(key: string, partial: Partial<ReviewItem> = {}): ReviewItem {
  return { key, source: 's', translation: 't', status: 'draft', confidence: '0.9', note: '', diagnostics: [], ...partial }
}

describe('bulkApproveBlocker', () => {
  it('신뢰도가 기준 이상이고 진단이 없는 초안은 승인 대상', () => {
    expect(bulkApproveBlocker(item('a'), 0.7)).toBeNull()
    expect(bulkApproveBlocker(item('a', { confidence: '0.7' }), 0.7)).toBeNull()
  })

  it('초안이 아니면 뺀다', () => {
    expect(bulkApproveBlocker(item('a', { status: 'review' }), 0.7)).toBe('not-draft')
    expect(bulkApproveBlocker(item('a', { status: 'stale' }), 0.7)).toBe('not-draft')
    expect(bulkApproveBlocker(item('a', { status: 'approved' }), 0.7)).toBe('not-draft')
  })

  it('경고 하나라도 있으면 뺀다', () => {
    expect(bulkApproveBlocker(item('a', { diagnostics: [warning] }), 0.7)).toBe('has-diagnostics')
  })

  it('신뢰도가 기준 미만이면 뺀다', () => {
    expect(bulkApproveBlocker(item('a', { confidence: '0.69' }), 0.7)).toBe('low-confidence')
  })

  it('신뢰도가 비어 있으면(사람이 고친 초안) 낮은 것으로 보지 않는다', () => {
    expect(bulkApproveBlocker(item('a', { confidence: '' }), 0.7)).toBeNull()
  })

  it('번역문이 비면 뺀다', () => {
    expect(bulkApproveBlocker(item('a', { translation: ' ' }), 0.7)).toBe('empty')
  })
})

describe('bulkApproveTargets', () => {
  it('조건에 맞는 행만 순서대로', () => {
    const items = [item('a'), item('b', { confidence: '0.2' }), item('c', { status: 'review' }), item('d', { confidence: '' })]
    expect(bulkApproveTargets(items, 0.7).map((row) => row.key)).toEqual(['a', 'd'])
  })
})
