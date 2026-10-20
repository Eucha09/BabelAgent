import { describe, expect, it } from 'vitest'
import { contentHash, sourceHash } from './hash'

describe('sourceHash', () => {
  it('같은 문자열은 같은 해시', () => {
    expect(sourceHash('안녕하세요')).toBe(sourceHash('안녕하세요'))
  })

  it('16자 hex', () => {
    expect(sourceHash('hello')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('CRLF와 LF를 같게 본다', () => {
    expect(sourceHash('a\r\nb')).toBe(sourceHash('a\nb'))
  })

  it('앞뒤 공백은 다른 값으로 본다', () => {
    expect(sourceHash(' hello')).not.toBe(sourceHash('hello'))
    expect(sourceHash('hello ')).not.toBe(sourceHash('hello'))
  })

  it('대소문자를 구분한다', () => {
    expect(sourceHash('Hello')).not.toBe(sourceHash('hello'))
  })

  it('빈 문자열도 해시한다', () => {
    expect(sourceHash('')).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('contentHash', () => {
  it('같은 바이트는 같은 해시', () => {
    const bytes = new TextEncoder().encode('key,source\n')
    expect(contentHash(bytes)).toBe(contentHash(new TextEncoder().encode('key,source\n')))
  })

  it('한 바이트만 달라도 바뀐다', () => {
    const a = new TextEncoder().encode('key,source\n')
    const b = new TextEncoder().encode('key,source!')
    expect(contentHash(a)).not.toBe(contentHash(b))
  })
})
