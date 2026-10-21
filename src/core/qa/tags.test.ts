import { describe, expect, it } from 'vitest'
import {
  checkTagStructure,
  compareTagSets,
  scanTags,
  stripTags,
  structureProblemsBeyondSource,
  tagIds
} from './tags'

const ids = (text: string): string[] => tagIds(scanTags(text))
const structure = (text: string) => checkTagStructure(scanTags(text))

describe('scanTags', () => {
  it('알려진 태그와 속성값', () => {
    expect(ids('<b>Hi</b> <color=#ff0000>red</color> <size=120%>x</size>')).toEqual(['b', 'color=#ff0000', 'size=120%'])
  })

  it('따옴표 속성과 공백 속성', () => {
    expect(ids('<link="item_01">x</link> <sprite name="coin" index=1>')).toEqual(['link="item_01"', 'sprite name="coin" index=1'])
  })

  it('#hex 단축형은 color 로 본다', () => {
    const tokens = scanTags('<#FF8000>x</color>')
    expect(tokens.map((token) => token.id)).toEqual(['color=#FF8000', 'color'])
    expect(checkTagStructure(tokens).unclosed).toEqual([])
  })

  it('이름은 대소문자를 가리지 않는다', () => {
    expect(ids('<B>x</b>')).toEqual(['b'])
  })

  it('일반 텍스트의 꺾쇠는 태그가 아니다', () => {
    expect(scanTags('a < b and c > d')).toEqual([])
    expect(scanTags('a<b and c>d')).toEqual([])
    expect(scanTags('<unknown>x</unknown>')).toEqual([])
  })

  it('noparse 안쪽은 보지 않는다', () => {
    expect(ids('<noparse><b>literal</noparse> <i>x</i>')).toEqual(['noparse', 'i'])
  })
})

describe('compareTagSets', () => {
  it('속성값이 다르면 다른 태그', () => {
    expect(compareTagSets(ids('<color=#ff0000>a</color>'), ids('<color=#00ff00>a</color>'))).toEqual({
      missing: ['color=#ff0000'],
      extra: ['color=#00ff00']
    })
  })

  it('순서와 횟수는 보지 않는다', () => {
    expect(compareTagSets(ids('<b>a</b> <i>b</i> <b>c</b>'), ids('<i>b</i> <b>a c</b>'))).toEqual({ missing: [], extra: [] })
  })
})

describe('checkTagStructure', () => {
  it('짝이 맞는 중첩', () => {
    expect(structure('<b><i>x</i></b>')).toEqual({ orphanClosers: [], crossed: [], unclosed: [] })
  })

  it('어긋난 중첩', () => {
    expect(structure('<b><i>x</b></i>').crossed).toEqual(['b'])
  })

  it('닫히지 않은 태그와 짝 없는 닫는 태그', () => {
    expect(structure('<b>x')).toMatchObject({ unclosed: ['b'] })
    expect(structure('x</b>')).toMatchObject({ orphanClosers: ['b'] })
  })

  it('닫는 태그가 없는 태그는 짝을 보지 않는다', () => {
    expect(structure('a<br>b <sprite=3>')).toEqual({ orphanClosers: [], crossed: [], unclosed: [] })
  })
})

describe('structureProblemsBeyondSource', () => {
  it('원문이 일부러 열어 둔 태그는 번역 탓이 아니다', () => {
    const result = structureProblemsBeyondSource(structure('<color=#fff>All rest'), structure('<color=#fff>나머지 전부'))
    expect(result.unclosed).toEqual([])
  })

  it('원문보다 하나 더 열어 두면 문제', () => {
    const result = structureProblemsBeyondSource(structure('<b>a</b>'), structure('<b>a'))
    expect(result.unclosed).toEqual(['b'])
  })
})

describe('stripTags', () => {
  it('알려진 태그만 지운다', () => {
    expect(stripTags('<b>Hi</b> a < b <x>')).toBe('Hi a < b <x>')
  })
})
