import { describe, expect, it } from 'vitest'
import { insertAfter, moveByOffset, moveRelative } from './order'

const rows = ['a', 'b', 'c', 'd'].map((key) => ({ key }))
const keys = (list: { key: string }[]): string[] => list.map((row) => row.key)

describe('moveByOffset', () => {
  it('한 칸 위로', () => {
    expect(keys(moveByOffset(rows, 'c', -1))).toEqual(['a', 'c', 'b', 'd'])
  })

  it('한 칸 아래로', () => {
    expect(keys(moveByOffset(rows, 'b', 1))).toEqual(['a', 'c', 'b', 'd'])
  })

  it('맨 위에서 위로는 그대로', () => {
    expect(keys(moveByOffset(rows, 'a', -1))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('맨 아래에서 아래로는 그대로', () => {
    expect(keys(moveByOffset(rows, 'd', 1))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('없는 키는 그대로', () => {
    expect(keys(moveByOffset(rows, 'z', 1))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('입력 배열을 바꾸지 않는다', () => {
    moveByOffset(rows, 'b', 1)
    expect(keys(rows)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('moveRelative', () => {
  it('아래 행의 앞으로', () => {
    expect(keys(moveRelative(rows, 'a', 'c', 'before'))).toEqual(['b', 'a', 'c', 'd'])
  })

  it('아래 행의 뒤로', () => {
    expect(keys(moveRelative(rows, 'a', 'c', 'after'))).toEqual(['b', 'c', 'a', 'd'])
  })

  it('위 행의 앞으로', () => {
    expect(keys(moveRelative(rows, 'd', 'b', 'before'))).toEqual(['a', 'd', 'b', 'c'])
  })

  it('맨 끝 뒤로', () => {
    expect(keys(moveRelative(rows, 'a', 'd', 'after'))).toEqual(['b', 'c', 'd', 'a'])
  })

  it('자기 자신 위에 놓으면 그대로', () => {
    expect(keys(moveRelative(rows, 'b', 'b', 'after'))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('없는 키는 그대로', () => {
    expect(keys(moveRelative(rows, 'z', 'b', 'after'))).toEqual(['a', 'b', 'c', 'd'])
    expect(keys(moveRelative(rows, 'a', 'z', 'after'))).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('insertAfter', () => {
  it('기준 행 바로 아래', () => {
    expect(keys(insertAfter(rows, { key: 'x' }, 'b'))).toEqual(['a', 'b', 'x', 'c', 'd'])
  })

  it('기준이 없으면 맨 끝', () => {
    expect(keys(insertAfter(rows, { key: 'x' }, null))).toEqual(['a', 'b', 'c', 'd', 'x'])
  })

  it('기준을 못 찾으면 맨 끝', () => {
    expect(keys(insertAfter(rows, { key: 'x' }, 'z'))).toEqual(['a', 'b', 'c', 'd', 'x'])
  })

  it('빈 목록에도 넣는다', () => {
    expect(keys(insertAfter([], { key: 'x' }, null))).toEqual(['x'])
  })
})
