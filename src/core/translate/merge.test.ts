import { describe, expect, it } from 'vitest'
import type { TranslationRow } from '@shared/schema/strings'
import { mergeTranslations, rowFingerprint, type MasterSource } from './merge'

const existing: TranslationRow[] = [
  { key: 'a', text: 'Old A', source_hash: 'old', status: 'stale', confidence: '0.5', note: '', source_snapshot: '옛 원문' },
  { key: 'ok', text: 'Approved', source_hash: 'h-ok', status: 'approved', confidence: '1', note: '', source_snapshot: '' }
]
const master = new Map<string, MasterSource>([
  ['a', { source: '원문 A', source_hash: 'h-a' }],
  ['b', { source: '원문 B', source_hash: 'h-b' }],
  ['ok', { source: '원문 OK', source_hash: 'h-ok' }]
])

describe('mergeTranslations', () => {
  it('기존 행을 덮고 draft 와 현재 원문의 해시·원문을 단다', () => {
    const result = mergeTranslations(existing, [{ key: 'a', text: 'New A', confidence: 0.876, note: '확인 필요' }], master)
    expect(result.rows[0]).toEqual({
      key: 'a',
      text: 'New A',
      source_hash: 'h-a',
      status: 'draft',
      confidence: '0.88',
      note: '확인 필요',
      source_snapshot: '원문 A'
    })
  })

  it('없던 키는 뒤에 붙인다', () => {
    const result = mergeTranslations(existing, [{ key: 'b', text: 'B', confidence: 0.9 }], master)
    expect(result.rows.map((row) => row.key)).toEqual(['a', 'ok', 'b'])
    expect(result.rows[2]?.note).toBe('')
    expect(result.rows[2]?.source_snapshot).toBe('원문 B')
  })

  it('approved 는 덮지 않는다', () => {
    const result = mergeTranslations(existing, [{ key: 'ok', text: 'Overwrite', confidence: 0.9 }], master)
    expect(result.rows[1]?.text).toBe('Approved')
    expect(result.skippedApproved).toEqual(['ok'])
    expect(result.written).toEqual([])
  })

  it('작업 시작 뒤 사용자가 고친 행은 덮지 않는다', () => {
    const baseline = new Map([
      ['a', rowFingerprint({ text: 'Older A', status: 'stale' })],
      ['b', rowFingerprint(undefined)]
    ])
    const result = mergeTranslations(
      existing,
      [
        { key: 'a', text: 'New A', confidence: 0.9 },
        { key: 'b', text: 'B', confidence: 0.9 }
      ],
      master,
      baseline
    )
    expect(result.skippedChanged).toEqual(['a'])
    expect(result.written).toEqual(['b'])
    expect(result.rows[0]?.text).toBe('Old A')
  })

  it('입력 배열을 바꾸지 않는다', () => {
    mergeTranslations(existing, [{ key: 'a', text: 'New', confidence: 0.9 }], master)
    expect(existing[0]?.text).toBe('Old A')
  })
})
