import { describe, expect, it } from 'vitest'
import type { TranslationRow } from '@shared/schema/strings'
import { mergeTranslations } from './merge'

const existing: TranslationRow[] = [
  { key: 'a', text: 'Old A', source_hash: 'old', status: 'stale', confidence: '0.5', note: '' },
  { key: 'ok', text: 'Approved', source_hash: 'h-ok', status: 'approved', confidence: '1', note: '' }
]
const hashes = new Map([
  ['a', 'h-a'],
  ['b', 'h-b'],
  ['ok', 'h-ok']
])

describe('mergeTranslations', () => {
  it('기존 행을 덮고 draft 와 현재 원문 해시를 단다', () => {
    const result = mergeTranslations(existing, [{ key: 'a', text: 'New A', confidence: 0.876, note: '확인 필요' }], hashes)
    expect(result.rows[0]).toEqual({
      key: 'a',
      text: 'New A',
      source_hash: 'h-a',
      status: 'draft',
      confidence: '0.88',
      note: '확인 필요'
    })
  })

  it('없던 키는 뒤에 붙인다', () => {
    const result = mergeTranslations(existing, [{ key: 'b', text: 'B', confidence: 0.9 }], hashes)
    expect(result.rows.map((row) => row.key)).toEqual(['a', 'ok', 'b'])
    expect(result.rows[2]?.note).toBe('')
  })

  it('approved 는 덮지 않는다', () => {
    const result = mergeTranslations(existing, [{ key: 'ok', text: 'Overwrite', confidence: 0.9 }], hashes)
    expect(result.rows[1]?.text).toBe('Approved')
    expect(result.skippedApproved).toEqual(['ok'])
    expect(result.written).toEqual([])
  })

  it('입력 배열을 바꾸지 않는다', () => {
    mergeTranslations(existing, [{ key: 'a', text: 'New', confidence: 0.9 }], hashes)
    expect(existing[0]?.text).toBe('Old A')
  })
})
