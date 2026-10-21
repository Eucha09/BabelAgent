import { describe, expect, it } from 'vitest'
import { diffWords, tokenizeWords } from './diff'

const join = (parts: ReturnType<typeof diffWords>, kinds: readonly string[]): string =>
  parts
    .filter((part) => kinds.includes(part.kind))
    .map((part) => part.text)
    .join('')

describe('diffWords', () => {
  it('같으면 한 조각', () => {
    expect(diffWords('Hello world', 'Hello world')).toEqual([{ kind: 'same', text: 'Hello world' }])
    expect(diffWords('', '')).toEqual([])
  })

  it('바뀐 단어만 표시한다', () => {
    expect(diffWords('Defeat 3 slimes', 'Defeat 5 slimes')).toEqual([
      { kind: 'same', text: 'Defeat ' },
      { kind: 'remove', text: '3' },
      { kind: 'add', text: '5' },
      { kind: 'same', text: ' slimes' }
    ])
  })

  it('추가와 삭제', () => {
    const parts = diffWords('Open the door', 'Open the red door now')
    expect(join(parts, ['same', 'remove'])).toBe('Open the door')
    expect(join(parts, ['same', 'add'])).toBe('Open the red door now')
    expect(join(parts, ['add'])).toBe('red  now')
  })

  it('한국어 어절', () => {
    const parts = diffWords('슬라임 3마리를 처치하세요', '슬라임 5마리를 처치하세요')
    expect(join(parts, ['same', 'remove'])).toBe('슬라임 3마리를 처치하세요')
    expect(join(parts, ['same', 'add'])).toBe('슬라임 5마리를 처치하세요')
    expect(parts[0]).toEqual({ kind: 'same', text: '슬라임 ' })
  })

  it('빈 쪽과 비교', () => {
    expect(diffWords('', 'new')).toEqual([{ kind: 'add', text: 'new' }])
    expect(diffWords('old', '')).toEqual([{ kind: 'remove', text: 'old' }])
  })

  it('양쪽을 이어 붙이면 원래 글이 된다', () => {
    const before = 'The {item} costs <b>{price}</b> gold.\nBuy it?'
    const after = 'This {item} now costs <b>{price}</b> silver.\nBuy?'
    const parts = diffWords(before, after)
    expect(join(parts, ['same', 'remove'])).toBe(before)
    expect(join(parts, ['same', 'add'])).toBe(after)
  })
})

describe('tokenizeWords', () => {
  it('단어와 공백을 나눈다', () => {
    expect(tokenizeWords('a b')).toEqual(['a', ' ', 'b'])
  })
})
