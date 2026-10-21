import { describe, expect, it } from 'vitest'
import { highlightSegments } from './highlight'
import type { SmartSyntax } from './smart'

const syntax: SmartSyntax = { alternativeEscaping: false, escapeChar: '\\', convertCharacterStringLiterals: false }

describe('highlightSegments', () => {
  it('변수와 태그를 구간으로 나눈다', () => {
    expect(highlightSegments('Hi <b>{name}</b>!', syntax)).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'tag', text: '<b>' },
      { kind: 'var', text: '{name}' },
      { kind: 'tag', text: '</b>' },
      { kind: 'text', text: '!' }
    ])
  })

  it('포매터 플레이스홀더는 안쪽 태그까지 한 구간', () => {
    expect(highlightSegments('{n:plural:<b>one</b>|many}', syntax)).toEqual([
      { kind: 'var', text: '{n:plural:<b>one</b>|many}' }
    ])
  })

  it('이스케이프된 중괄호는 글자', () => {
    expect(highlightSegments('{{x}}', syntax)).toEqual([{ kind: 'text', text: '{{x}}' }])
  })

  it('빈 글', () => {
    expect(highlightSegments('', syntax)).toEqual([])
  })
})
