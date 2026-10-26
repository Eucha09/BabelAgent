import { describe, expect, it } from 'vitest'
import type { GlossaryEntry } from '@shared/schema/glossary'
import {
  appendCandidates,
  applyGlossaryChanges,
  fromGlossaryEntry,
  glossaryHeader,
  glossaryStatusOf,
  toGlossaryEntries,
  toGlossaryEntry
} from './entries'

const languages = ['en', 'ja']

const records = (): Record<string, string>[] => [
  { term: '바벨탑', translation_en: 'Tower of Babel', translation_ja: 'バベルの塔', pos: '지명', note: '', strict: 'true', status: '', memo: '사용자 열' },
  { term: '물약', translation_en: 'Potion', translation_ja: '', pos: '', note: '', strict: '', status: 'approved' },
  { term: '대장장이', translation_en: 'Smith', translation_ja: '', pos: '', note: '', strict: '', status: 'pending', reason: '직업 이름', confidence: '0.8' }
]

function entry(term: string, patch: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    term,
    translations: { en: '', ja: '' },
    pos: '',
    note: '',
    strict: false,
    status: 'approved',
    reason: '',
    confidence: '',
    ...patch
  }
}

describe('glossaryStatusOf', () => {
  it('비었거나 approved 면 승인, 그 밖의 값은 승인 전', () => {
    expect(glossaryStatusOf('')).toBe('approved')
    expect(glossaryStatusOf(' Approved ')).toBe('approved')
    expect(glossaryStatusOf('pending')).toBe('pending')
    expect(glossaryStatusOf('rejected')).toBe('pending')
  })
})

describe('glossaryHeader', () => {
  it('파일이 없으면 용어 → 대상 언어 → 나머지 열', () => {
    expect(glossaryHeader([], languages)).toEqual([
      'term',
      'translation_en',
      'translation_ja',
      'pos',
      'note',
      'strict',
      'status',
      'reason',
      'confidence'
    ])
  })

  it('있던 열 순서와 사용자 열을 지키고, 빠진 언어 열은 마지막 번역 열 뒤에 넣는다', () => {
    expect(glossaryHeader(['term', 'translation_en', 'memo', 'note'], languages)).toEqual([
      'term',
      'translation_en',
      'translation_ja',
      'memo',
      'note',
      'pos',
      'strict',
      'status',
      'reason',
      'confidence'
    ])
  })
})

describe('toGlossaryEntries', () => {
  it('대상 언어의 번역만 담고, 빈 용어 행은 빼고, 겹친 용어는 첫 행만 둔다', () => {
    const rows = [...records(), { term: '' }, { term: ' 바벨탑 ', translation_en: 'Babel' }]
    const result = toGlossaryEntries(rows, ['en'])
    expect(result.entries.map((item) => item.term)).toEqual(['바벨탑', '물약', '대장장이'])
    expect(result.entries[0]?.translations).toEqual({ en: 'Tower of Babel' })
    expect(result.entries[0]?.strict).toBe(true)
    expect(result.entries[2]?.status).toBe('pending')
    expect(result.duplicates).toEqual(['바벨탑'])
  })
})

describe('fromGlossaryEntry', () => {
  it('다른 열과 같은 뜻의 원래 표기(빈 status·빈 strict)를 지킨다', () => {
    const base = records()[1] ?? {}
    const record = fromGlossaryEntry(toGlossaryEntry(base, languages), { ...base, status: '', extra: 'x' })
    expect(record['status']).toBe('')
    expect(record['strict']).toBe('')
    expect(record['extra']).toBe('x')
  })

  it('뜻이 바뀌면 표준 값으로 쓴다', () => {
    const base = records()[1] ?? {}
    const record = fromGlossaryEntry({ ...toGlossaryEntry(base, languages), strict: true }, base)
    expect(record['strict']).toBe('true')
  })
})

describe('applyGlossaryChanges', () => {
  const current = (index: number): GlossaryEntry => toGlossaryEntry(records()[index] ?? {}, languages)

  it('추가·수정·삭제를 차례로 적용하고 사용자 열은 남긴다', () => {
    const result = applyGlossaryChanges(
      records(),
      [
        { original: null, next: entry('마나', { translations: { en: 'Mana', ja: 'マナ' } }), expected: null },
        { original: '바벨탑', next: { ...current(0), note: '고유명사' }, expected: current(0) },
        { original: '물약', next: null, expected: current(1) }
      ],
      languages
    )
    expect(result.applied).toEqual(['마나', '바벨탑', '물약'])
    expect(result.skipped).toEqual([])
    expect(result.records.map((record) => record['term'])).toEqual(['바벨탑', '대장장이', '마나'])
    expect(result.records[0]?.['note']).toBe('고유명사')
    expect(result.records[0]?.['memo']).toBe('사용자 열')
  })

  it('승인은 상태만 바꾼 수정이다', () => {
    const result = applyGlossaryChanges(records(), [{ original: '대장장이', next: { ...current(2), status: 'approved' }, expected: current(2) }], languages)
    expect(result.records[2]?.['status']).toBe('approved')
  })

  it('화면이 본 뒤 바뀐 행, 없는 행, 겹치는 이름, 빈 용어는 건너뛴다', () => {
    const stale = { ...current(0), note: '예전 메모' }
    const result = applyGlossaryChanges(
      records(),
      [
        { original: '바벨탑', next: { ...current(0), pos: '장소' }, expected: stale },
        { original: '없는 용어', next: entry('없는 용어'), expected: entry('없는 용어') },
        { original: '물약', next: { ...current(1), term: '바벨탑' }, expected: current(1) },
        { original: null, next: entry('물약'), expected: null },
        { original: null, next: entry('  '), expected: null }
      ],
      languages
    )
    expect(result.applied).toEqual([])
    expect(result.skipped.map((item) => item.reason)).toEqual(['changed', 'missing', 'exists', 'exists', 'invalid'])
    expect(result.records).toEqual(records())
  })

  it('대소문자만 바꾼 이름 바꾸기는 같은 행이라 허용한다', () => {
    const result = applyGlossaryChanges(
      [{ term: 'babel', translation_en: 'Babel' }],
      [{ original: 'babel', next: entry('Babel', { translations: { en: 'Babel' } }), expected: null }],
      ['en']
    )
    expect(result.records[0]?.['term']).toBe('Babel')
  })

  it('화면이 모르던 대상 언어 번역은 비교하지 않는다', () => {
    const seenBefore = { ...current(0), translations: { en: 'Tower of Babel' } }
    const result = applyGlossaryChanges(records(), [{ original: '바벨탑', next: { ...seenBefore, pos: '장소' }, expected: seenBefore }], languages)
    expect(result.applied).toEqual(['바벨탑'])
    expect(result.records[0]?.['translation_ja']).toBe('バベルの塔')
  })
})

describe('appendCandidates', () => {
  it('pending 으로 붙이고, 이미 있는 용어와 같은 제출 안에서 겹친 후보는 넣지 않는다', () => {
    const result = appendCandidates(
      records(),
      [
        { term: '마나', pos: '능력치', note: '', translations: { en: 'Mana', fr: 'Mana' }, reason: '반복 등장', confidence: 0.876 },
        { term: '물약', pos: '', note: '', translations: {}, reason: '', confidence: 0.9 },
        { term: '대장장이', pos: '', note: '', translations: {}, reason: '', confidence: 0.9 },
        { term: ' 마나 ', pos: '', note: '', translations: {}, reason: '', confidence: 0.5 }
      ],
      languages
    )
    expect(result.added).toEqual(['마나'])
    expect(result.existing).toEqual(['물약', '대장장이', '마나'])
    const added = result.records[3]
    expect(added).toMatchObject({
      term: '마나',
      translation_en: 'Mana',
      translation_ja: '',
      pos: '능력치',
      strict: 'false',
      status: 'pending',
      reason: '반복 등장',
      confidence: '0.88'
    })
    expect(added?.['translation_fr']).toBeUndefined()
  })
})
