import { describe, expect, it } from 'vitest'
import { countGraphemes, measureDisplayLength, parseMaxLen } from './length'
import type { SmartSyntax } from './smart'

const syntax: SmartSyntax = { alternativeEscaping: false, escapeChar: '\\', convertCharacterStringLiterals: false }
const measure = (text: string, examples: Record<string, string> = {}, caseSensitive = true) =>
  measureDisplayLength(text, syntax, new Map(Object.entries(examples)), caseSensitive)

describe('countGraphemes', () => {
  it('이모지와 조합 문자를 한 글자로 센다', () => {
    expect(countGraphemes('👍🏽')).toBe(1)
    expect(countGraphemes('👨‍👩‍👧')).toBe(1)
    expect(countGraphemes('é')).toBe(1)
    expect(countGraphemes('한글')).toBe(2)
  })
})

describe('measureDisplayLength', () => {
  it('example 로 치환해 센다', () => {
    const result = measure('Hi {playerName}!', { playerName: '바벨' })
    expect(result.length).toBe(6)
    expect(result.assumptions).toEqual([{ name: 'playerName', example: '바벨' }])
  })

  it('example 이 없으면 플레이스홀더 길이 그대로', () => {
    const result = measure('Hi {name}')
    expect(result.length).toBe(9)
    expect(result.assumptions).toEqual([{ name: 'name', example: null }])
  })

  it('태그는 보이지 않으므로 빼고 센다', () => {
    expect(measure('<color=#ff0000>Hot</color>').length).toBe(3)
  })

  it('이스케이프를 푼 글자로 센다', () => {
    expect(measure('{{x}}').length).toBe(3)
  })

  it('분기가 있는 포매터는 가장 긴 분기', () => {
    expect(measure('{count:plural:one item|{} items}', { count: '12' }).length).toBe(8)
  })

  it('분기 안의 빈 플레이스홀더는 바깥 변수의 example', () => {
    expect(measure('{n:plural:{}개|{}개들}', { n: '100' }).length).toBe(5)
  })

  it('분기가 하나뿐인 형식은 변수 하나로 센다', () => {
    expect(measure('{n:N2}', { n: '100' }).length).toBe(3)
  })

  it('caseSensitive 가 꺼져 있으면 이름 대소문자를 무시하고 example 을 찾는다', () => {
    expect(measure('{Name}', { name: 'ab' }, false).length).toBe(2)
  })
})

describe('parseMaxLen', () => {
  it('양의 정수만 제한으로 본다', () => {
    expect(parseMaxLen('20')).toBe(20)
    expect(parseMaxLen(' 7 ')).toBe(7)
    expect(parseMaxLen('')).toBeNull()
    expect(parseMaxLen('0')).toBeNull()
    expect(parseMaxLen('abc')).toBeNull()
    expect(parseMaxLen('1.5')).toBeNull()
  })
})
