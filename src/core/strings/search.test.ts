import { describe, expect, it } from 'vitest'
import { filterStringsRows, isSearching, matchesStringsSearch, sameSearch, type SearchableRow } from './search'

function row(key: string, partial: Partial<SearchableRow> = {}): SearchableRow {
  return { key, source: '', context: '', translation: '', ...partial }
}

const rows: SearchableRow[] = [
  row('menu.start', { source: '게임 시작', context: 'Main menu button', translation: 'Start Game' }),
  row('menu.quit', { source: '종료', context: 'Main menu button', translation: '' }),
  row('dialog.greet', { source: '안녕, {name}!', context: 'NPC greeting', translation: 'Hello, {name}!' }),
  row('item.potion', { source: '물약', context: '', translation: 'Potion' })
]

const keys = (search: string, pinned: ReadonlySet<string> = new Set()): string[] =>
  filterStringsRows(rows, search, pinned).map((item) => item.key)

describe('원문 화면 검색', () => {
  it('검색어가 비었거나 공백뿐이면 모든 행을 순서대로 돌려준다', () => {
    expect(keys('')).toEqual(['menu.start', 'menu.quit', 'dialog.greet', 'item.potion'])
    expect(keys('   ')).toEqual(['menu.start', 'menu.quit', 'dialog.greet', 'item.potion'])
    expect(isSearching('  ')).toBe(false)
    expect(isSearching(' a ')).toBe(true)
  })

  it('키·원문·컨텍스트·번역에서 찾는다', () => {
    expect(keys('item.')).toEqual(['item.potion'])
    expect(keys('종료')).toEqual(['menu.quit'])
    expect(keys('npc')).toEqual(['dialog.greet'])
    expect(keys('potion')).toEqual(['item.potion'])
  })

  it('대소문자를 가리지 않고 앞뒤 공백을 무시한다', () => {
    expect(keys('  MAIN MENU ')).toEqual(['menu.start', 'menu.quit'])
  })

  it('변수 같은 기호도 글자 그대로 찾는다', () => {
    expect(keys('{name}')).toEqual(['dialog.greet'])
  })

  it('맞는 행이 없으면 빈 목록', () => {
    expect(keys('없는 말')).toEqual([])
  })

  it('고정한 행은 검색어와 맞지 않아도 남고, 순서는 원래대로', () => {
    expect(keys('potion', new Set(['menu.start']))).toEqual(['menu.start', 'item.potion'])
  })

  it('검색하지 않을 때는 고정과 상관없이 모든 행', () => {
    expect(keys('', new Set(['menu.start']))).toHaveLength(4)
  })

  it('입력을 바꾸지 않는다', () => {
    const before = rows.map((item) => item.key)
    filterStringsRows(rows, 'menu', new Set())
    expect(rows.map((item) => item.key)).toEqual(before)
  })

  it('공백·대소문자만 다른 검색어는 같은 검색어', () => {
    expect(sameSearch('등불', '등불 ')).toBe(true)
    expect(sameSearch('Menu', ' menu')).toBe(true)
    expect(sameSearch('', '   ')).toBe(true)
    expect(sameSearch('등불', '등불지기')).toBe(false)
  })

  it('한 행 판정', () => {
    expect(matchesStringsSearch(row('a', { translation: 'Start' }), 'START')).toBe(true)
    expect(matchesStringsSearch(row('a', { translation: 'Start' }), 'stop')).toBe(false)
  })
})
