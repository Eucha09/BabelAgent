import { describe, expect, it } from 'vitest'
import type { TranslationRow } from '@shared/schema/strings'
import { applyStale } from './stale'

function row(partial: Partial<TranslationRow> & { key: string }): TranslationRow {
  return {
    text: '',
    source_hash: 'h1',
    status: 'untranslated',
    confidence: '',
    note: '',
    source_snapshot: '',
    ...partial
  }
}

describe('applyStale', () => {
  it('원문이 바뀌면 번역이 stale이 된다', () => {
    const result = applyStale(
      [row({ key: 'k1', text: 'Hello', status: 'draft', source_hash: 'old' })],
      new Map([['k1', 'new']])
    )
    expect(result.rows[0]?.status).toBe('stale')
    expect(result.markedKeys).toEqual(['k1'])
  })

  it('stale이 되어도 번역문과 원래 해시는 남긴다', () => {
    const result = applyStale(
      [row({ key: 'k1', text: 'Hello', status: 'approved', source_hash: 'old' })],
      new Map([['k1', 'new']])
    )
    expect(result.rows[0]?.text).toBe('Hello')
    expect(result.rows[0]?.source_hash).toBe('old')
  })

  it('해시가 같으면 건드리지 않는다', () => {
    const input = [row({ key: 'k1', text: 'Hello', status: 'approved', source_hash: 'same' })]
    const result = applyStale(input, new Map([['k1', 'same']]))
    expect(result.rows[0]).toEqual(input[0])
    expect(result.markedKeys).toEqual([])
  })

  it('빈 번역은 stale로 만들지 않고 해시만 맞춘다', () => {
    const result = applyStale(
      [row({ key: 'k1', text: '   ', source_hash: 'old' })],
      new Map([['k1', 'new']])
    )
    expect(result.rows[0]?.status).toBe('untranslated')
    expect(result.rows[0]?.source_hash).toBe('new')
    expect(result.markedKeys).toEqual([])
  })

  it('이미 stale이면 다시 세지 않는다', () => {
    const result = applyStale(
      [row({ key: 'k1', text: 'Hello', status: 'stale', source_hash: 'old' })],
      new Map([['k1', 'new']])
    )
    expect(result.markedKeys).toEqual([])
  })

  it('원문에 없는 키는 고아로 보고하고 그대로 둔다', () => {
    const result = applyStale([row({ key: 'gone', text: 'Hi', status: 'draft' })], new Map())
    expect(result.orphanKeys).toEqual(['gone'])
    expect(result.rows[0]?.status).toBe('draft')
  })
})
