import { describe, expect, it } from 'vitest'
import { formatterNames, parseSmart, splitBranches, walkPlaceholders, type SmartPlaceholder, type SmartSyntax } from './smart'

const standard: SmartSyntax = { alternativeEscaping: false, escapeChar: '\\', convertCharacterStringLiterals: false }
const alternative: SmartSyntax = { alternativeEscaping: true, escapeChar: '\\', convertCharacterStringLiterals: false }
const literals: SmartSyntax = { alternativeEscaping: false, escapeChar: '\\', convertCharacterStringLiterals: true }

function placeholders(text: string, syntax = standard): SmartPlaceholder[] {
  return [...walkPlaceholders(parseSmart(text, syntax).tokens)]
}

function only(text: string, syntax = standard): SmartPlaceholder {
  const [first] = placeholders(text, syntax)
  if (!first) throw new Error(`플레이스홀더가 없다: ${text}`)
  return first
}

describe('포매터 이름 판정 (qa-rules.md 고정 케이스)', () => {
  it('{count:plural:one|other} → 포매터 plural', () => {
    const placeholder = only('{count:plural:one|other}')
    expect(placeholder.selector).toBe('count')
    expect(placeholder.formatter).toBe('plural')
    expect(placeholder.options).toBeUndefined()
  })

  it('{0:choose(1|2):a|b} → 포매터 choose, 옵션 1|2', () => {
    const placeholder = only('{0:choose(1|2):a|b}')
    expect(placeholder.selector).toBe('0')
    expect(placeholder.formatter).toBe('choose')
    expect(placeholder.options).toBe('1|2')
  })

  it('{0:a|b|c} → 이름 생략', () => {
    const placeholder = only('{0:a|b|c}')
    expect(placeholder.formatter).toBeUndefined()
    expect(placeholder.body).toEqual([{ kind: 'literal', text: 'a|b|c', start: 3, end: 8 }])
  })

  it('{name} → 포매터 없음', () => {
    const placeholder = only('{name}')
    expect(placeholder).toMatchObject({ selector: 'name', closed: true })
    expect(placeholder.formatter).toBeUndefined()
    expect(placeholder.body).toBeUndefined()
  })

  it('{} → 빈 선택자', () => {
    expect(only('{}').selector).toBe('')
  })

  it('형식 문자열 {0:N2} 는 이름이 아니다 — ( 나 : 로 끝나지 않는다', () => {
    expect(only('{0:N2}').formatter).toBeUndefined()
  })

  it('이름 자리에 공백이나 | 가 섞이면 이름 생략', () => {
    expect(only('{0:one item|many:x}').formatter).toBeUndefined()
  })

  it('옵션 뒤에 : 나 } 가 오지 않으면 이름으로 보지 않는다', () => {
    expect(only('{0:choose(1)x}').formatter).toBeUndefined()
  })

  it('옵션만 있고 형식이 없는 형태 {0:choose(1|2)}', () => {
    const placeholder = only('{0:choose(1|2)}')
    expect(placeholder).toMatchObject({ formatter: 'choose', options: '1|2', closed: true })
  })
})

describe('중첩', () => {
  it('형식 안의 플레이스홀더를 읽는다', () => {
    const all = placeholders('{count:plural:{name} has one|{name} has {count}}')
    expect(all.map((item) => item.selector)).toEqual(['count', 'name', 'name', 'count'])
  })

  it('형식 안의 빈 플레이스홀더', () => {
    const all = placeholders('{0:plural:{} item|{} items}')
    expect(all.map((item) => item.selector)).toEqual(['0', '', ''])
  })

  it('정렬 지정은 선택자에서 뺀다', () => {
    expect(only('{0,10}').selector).toBe('0')
  })

  it('점이 들어간 선택자는 그대로 둔다', () => {
    expect(only('{player.name}').selector).toBe('player.name')
  })

  it('formatterNames 는 모든 단계의 이름을 모은다', () => {
    const parsed = parseSmart('{a:plural:{b:list:x|y}|z} {c}', standard)
    expect(formatterNames(parsed.tokens)).toEqual(['plural', 'list'])
  })
})

describe('중괄호 짝', () => {
  it('짝이 맞으면 문제가 없다', () => {
    expect(parseSmart('Hi {name}, {count:plural:one|other}', standard).problems).toEqual([])
  })

  it('닫히지 않은 괄호', () => {
    const parsed = parseSmart('Hi {name', standard)
    expect(parsed.problems).toEqual([{ kind: 'unclosed', index: 3 }])
    expect(only('Hi {name')).toMatchObject({ selector: 'name', closed: false })
  })

  it('형식 안에서 닫히지 않은 괄호', () => {
    expect(parseSmart('{0:plural:one|other', standard).problems).toEqual([{ kind: 'unclosed', index: 0 }])
  })

  it('짝 없는 닫는 괄호', () => {
    expect(parseSmart('a } b', standard).problems).toEqual([{ kind: 'stray-close', index: 2 }])
  })

  it('하나 더 닫은 경우', () => {
    expect(parseSmart('{a}}x', alternative).problems).toEqual([{ kind: 'stray-close', index: 3 }])
  })
})

describe('이스케이프: alternativeEscaping = false', () => {
  it('{{ 와 }} 는 리터럴', () => {
    const parsed = parseSmart('{{literal}} {name}', standard)
    expect(parsed.problems).toEqual([])
    expect(parsed.tokens[0]).toEqual({ kind: 'literal', text: '{literal} ', start: 0, end: 12 })
    expect(placeholders('{{literal}} {name}').map((item) => item.selector)).toEqual(['name'])
  })

  it('백슬래시는 평범한 글자 — \\{ 는 플레이스홀더를 연다', () => {
    const all = placeholders('\\{name}')
    expect(all.map((item) => item.selector)).toEqual(['name'])
  })

  it('\\n 은 두 글자로 남는다', () => {
    expect(parseSmart('a\\nb', standard).tokens).toEqual([{ kind: 'literal', text: 'a\\nb', start: 0, end: 4 }])
  })
})

describe('이스케이프: alternativeEscaping = true', () => {
  it('escapeChar + { 는 리터럴', () => {
    const parsed = parseSmart('\\{literal\\} {name}', alternative)
    expect(parsed.problems).toEqual([])
    expect(placeholders('\\{literal\\} {name}', alternative).map((item) => item.selector)).toEqual(['name'])
  })

  it('{{ 는 이스케이프가 아니다 — SmartFormat 처럼 선택자 "{name" 뒤에 닫는 괄호가 하나 남는다', () => {
    const parsed = parseSmart('{{name}}', alternative)
    expect(parsed.problems).toEqual([{ kind: 'stray-close', index: 7 }])
    expect(placeholders('{{name}}', alternative).map((item) => item.selector)).toEqual(['{name'])
  })

  it('다른 escapeChar 를 따른다', () => {
    const tilde: SmartSyntax = { ...alternative, escapeChar: '~' }
    const parsed = parseSmart('~{x~} {y}', tilde)
    expect(placeholders('~{x~} {y}', tilde).map((item) => item.selector)).toEqual(['y'])
    expect(parsed.tokens[0]).toMatchObject({ kind: 'literal', text: '{x} ' })
  })

  it('convertCharacterStringLiterals 가 꺼져 있으면 \\n 은 그대로', () => {
    expect(parseSmart('a\\nb', alternative).tokens[0]).toMatchObject({ text: 'a\\nb' })
  })
})

describe('이스케이프: convertCharacterStringLiterals = true', () => {
  it('\\n, \\t 를 문자로 바꾼다', () => {
    expect(parseSmart('a\\nb\\tc', literals).tokens[0]).toMatchObject({ text: 'a\nb\tc' })
  })

  it('\\u 네 자리 16진수', () => {
    expect(parseSmart('\\u0041!', literals).tokens[0]).toMatchObject({ text: 'A!' })
  })

  it('\\{ 와 \\} 도 리터럴 중괄호 — SmartFormat 2.x 와 같다', () => {
    const parsed = parseSmart('\\{x\\} {y}', literals)
    expect(parsed.problems).toEqual([])
    expect(placeholders('\\{x\\} {y}', literals).map((item) => item.selector)).toEqual(['y'])
  })

  it('{{ 이스케이프와 함께 쓴다', () => {
    expect(parseSmart('{{a}}\\n', literals).tokens[0]).toMatchObject({ text: '{a}\n' })
  })

  it('끝의 백슬래시 하나는 글자로 남는다', () => {
    expect(parseSmart('a\\', literals).tokens[0]).toMatchObject({ text: 'a\\' })
  })
})

describe('splitBranches', () => {
  it('최상위 | 로만 나눈다', () => {
    const placeholder = only('{0:plural:one {1:a|b}|other}')
    const branches = splitBranches(placeholder.body ?? [])
    expect(branches).toHaveLength(2)
    expect(branches[0]?.map((token) => token.kind)).toEqual(['literal', 'placeholder'])
  })

  it('형식 문자열은 분기 하나', () => {
    expect(splitBranches(only('{0:N2}').body ?? [])).toHaveLength(1)
  })
})
