import { describe, expect, it } from 'vitest'
import { findDeletedStillPresent, findKeyProblems, validateNewKey } from './keys'

describe('validateNewKey', () => {
  const existing = new Set(['ui.start', 'ui.quit'])

  it('새 키는 통과', () => {
    expect(validateNewKey('ui.options', existing)).toBeNull()
  })

  it('빈 키는 막는다', () => {
    expect(validateNewKey('', existing)).toBe('empty')
  })

  it('이미 있는 키는 막는다', () => {
    expect(validateNewKey('ui.start', existing)).toBe('duplicate')
  })

  it('줄바꿈이 든 키는 막는다', () => {
    expect(validateNewKey('ui.\nstart', existing)).toBe('newline')
    expect(validateNewKey('ui.\rstart', existing)).toBe('newline')
  })

  it('대소문자가 다르면 다른 키', () => {
    expect(validateNewKey('UI.START', existing)).toBeNull()
  })
})

describe('findKeyProblems', () => {
  it('문제가 없으면 빈 결과', () => {
    expect(findKeyProblems(['a', 'b'])).toEqual({ emptyCount: 0, duplicates: [] })
  })

  it('빈 키를 센다', () => {
    expect(findKeyProblems(['a', '', '  ']).emptyCount).toBe(2)
  })

  it('중복 키를 한 번씩만 모은다', () => {
    expect(findKeyProblems(['a', 'b', 'a', 'a', 'b']).duplicates).toEqual(['a', 'b'])
  })
})

describe('findDeletedStillPresent', () => {
  it('원문에서 빠진 키는 문제없다', () => {
    expect(findDeletedStillPresent(['a', 'b'], ['c'])).toEqual([])
  })

  it('지운다면서 남아 있는 키를 찾는다', () => {
    expect(findDeletedStillPresent(['a', 'b'], ['b', 'c'])).toEqual(['b'])
  })
})
