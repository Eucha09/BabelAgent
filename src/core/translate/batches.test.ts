import { describe, expect, it } from 'vitest'
import type { MasterRow } from '@shared/schema/strings'
import { buildBatches, clampConcurrency } from './batches'

function row(key: string, source: string): MasterRow {
  return { key, source, context: '', ui_type: '', max_len: '', vars: '', smart: '', tags: '', source_hash: '' }
}

const sizes = (batches: ReturnType<typeof buildBatches>): number[] => batches.map((b) => b.rows.length)

describe('buildBatches', () => {
  it('행 수 한도에서 끊는다', () => {
    const rows = Array.from({ length: 7 }, (_, i) => row(`k${i}`, 'a'))
    expect(sizes(buildBatches(rows, { maxRows: 3, maxSourceChars: 1000 }))).toEqual([3, 3, 1])
  })

  it('글자 수 한도에서 끊는다', () => {
    const rows = [row('a', 'x'.repeat(40)), row('b', 'x'.repeat(40)), row('c', 'x'.repeat(40))]
    expect(sizes(buildBatches(rows, { maxRows: 30, maxSourceChars: 100 }))).toEqual([2, 1])
  })

  it('먼저 걸리는 쪽을 따른다', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(`k${i}`, 'x'.repeat(10)))
    expect(sizes(buildBatches(rows, { maxRows: 2, maxSourceChars: 1000 }))).toEqual([2, 2, 1])
    expect(sizes(buildBatches(rows, { maxRows: 30, maxSourceChars: 25 }))).toEqual([2, 2, 1])
  })

  it('한 행이 혼자 한도를 넘으면 그 행만으로 배치', () => {
    const rows = [row('a', 'x'), row('big', 'x'.repeat(500)), row('b', 'x')]
    const keys = buildBatches(rows, { maxRows: 30, maxSourceChars: 100 }).map((b) => b.rows.map((r) => r.key))
    expect(keys).toEqual([['a'], ['big'], ['b']])
  })

  it('입력 순서를 유지하고 순번은 1부터', () => {
    const rows = [row('c', 'x'), row('a', 'x'), row('b', 'x')]
    const batches = buildBatches(rows, { maxRows: 2, maxSourceChars: 1000 })
    expect(batches.map((b) => b.id)).toEqual([1, 2])
    expect(batches.flatMap((b) => b.rows.map((r) => r.key))).toEqual(['c', 'a', 'b'])
  })

  it('빈 입력은 빈 배치 목록', () => {
    expect(buildBatches([], { maxRows: 30, maxSourceChars: 3000 })).toEqual([])
  })
})

describe('clampConcurrency', () => {
  it.each([
    [2, 2],
    [3, 3],
    [10, 3],
    [0, 1],
    [-1, 1],
    [2.7, 2],
    [Number.NaN, 1]
  ])('%s → %s', (input, expected) => {
    expect(clampConcurrency(input)).toBe(expected)
  })
})
