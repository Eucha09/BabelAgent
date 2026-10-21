import { describe, expect, it } from 'vitest'
import { parseSmart, type SmartSyntax } from './smart'
import { compareVariables, examplesByName, extractVariables, parseVarsMeta } from './vars'

const syntax: SmartSyntax = { alternativeEscaping: false, escapeChar: '\\', convertCharacterStringLiterals: false }
const vars = (text: string): string[] => extractVariables(parseSmart(text, syntax).tokens)

describe('extractVariables', () => {
  it('이름과 인덱스를 모두 모은다', () => {
    expect(vars('{playerName} got {0} and {1}')).toEqual(['playerName', '0', '1'])
  })

  it('포매터가 붙으면 선택자만 취한다', () => {
    expect(vars('{count:plural:one|other}')).toEqual(['count'])
  })

  it('중첩 안의 변수도 모은다', () => {
    expect(vars('{count:plural:{name} has one|{name} has {count}}')).toEqual(['count', 'name'])
  })

  it('빈 플레이스홀더는 빼고, 중복은 한 번만', () => {
    expect(vars('{} {0:plural:{} item|{} items} {0}')).toEqual(['0'])
  })

  it('이스케이프된 중괄호는 변수가 아니다', () => {
    expect(vars('{{notVar}} {real}')).toEqual(['real'])
  })
})

describe('compareVariables', () => {
  it('집합이 같으면 순서와 횟수가 달라도 통과', () => {
    expect(compareVariables(['a', 'b'], ['b', 'a'], true)).toEqual({ missing: [], extra: [] })
  })

  it('빠진 변수와 남는 변수', () => {
    expect(compareVariables(['name', 'count'], ['count', 'nmae'], true)).toEqual({ missing: ['name'], extra: ['nmae'] })
  })

  it('caseSensitive 가 꺼져 있으면 대소문자를 무시한다', () => {
    expect(compareVariables(['Name'], ['name'], false)).toEqual({ missing: [], extra: [] })
    expect(compareVariables(['Name'], ['name'], true)).toEqual({ missing: ['Name'], extra: ['name'] })
  })
})

describe('parseVarsMeta', () => {
  it('빈 칸은 메타데이터 없음', () => {
    expect(parseVarsMeta('  ')).toEqual({ ok: true, items: [] })
  })

  it('문서의 예시를 읽는다', () => {
    const raw = '[{"name":"playerName","type":"string","meaning":"플레이어 이름","example":"바벨"},{"name":"count","type":"int","example":3}]'
    const parsed = parseVarsMeta(raw)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.items[1]?.example).toBe('3')
      expect(examplesByName(parsed.items, true).get('playerName')).toBe('바벨')
    }
  })

  it('JSON 이 깨지면 실패', () => {
    expect(parseVarsMeta('[{name:').ok).toBe(false)
  })

  it('배열이 아니거나 name 이 없으면 실패', () => {
    expect(parseVarsMeta('{"name":"a"}').ok).toBe(false)
    expect(parseVarsMeta('[{"example":"x"}]').ok).toBe(false)
  })

  it('examplesByName 은 caseSensitive 를 따른다', () => {
    const parsed = parseVarsMeta('[{"name":"Name","example":"x"}]')
    if (!parsed.ok) throw new Error('읽혀야 한다')
    expect(examplesByName(parsed.items, false).get('name')).toBe('x')
  })
})
