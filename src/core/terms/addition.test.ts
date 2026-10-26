import { describe, expect, it } from 'vitest'
import { createDefaultProjectConfig } from '@shared/schema/project'
import type { MasterRow, TranslationRow } from '@shared/schema/strings'
import {
  applyTermHints,
  buildTermEntryPrompt,
  buildTermEntrySystemPrompt,
  findTermConflicts,
  findTermUsages,
  judgeTermEntry,
  pickTermExamples,
  TERM_ENTRY_TOOL
} from './addition'

const config = createDefaultProjectConfig({ name: 'p', sourceLanguage: 'ko', targetLanguages: ['en', 'ja'], schemaVersion: 1 })

const row = (key: string, source: string, context = ''): MasterRow => ({
  key,
  source,
  context,
  ui_type: '',
  max_len: '',
  vars: '',
  tags: '',
  source_hash: 'h'
})

const translation = (key: string, text: string, status: TranslationRow['status'] = 'draft'): TranslationRow => ({
  key,
  text,
  source_hash: 'h',
  status,
  confidence: '',
  note: '',
  source_snapshot: ''
})

const rows = [
  row('a', '바벨탑에 오른다', '프롤로그'),
  row('b', '장비를 점검했다'),
  row('c', '바벨탑 꼭대기'),
  row('d', '검을 들었다'),
  row('e', '무너진 바벨탑')
]

const byLanguage = (entries: Record<string, TranslationRow[]>): Map<string, Map<string, TranslationRow>> =>
  new Map(Object.entries(entries).map(([language, list]) => [language, new Map(list.map((item) => [item.key, item]))]))

describe('findTermUsages', () => {
  it('QA 와 같은 방식으로 원문에서 찾는다(한국어는 부분 문자열)', () => {
    expect(findTermUsages('바벨탑', rows, 'ko').map((item) => item.key)).toEqual(['a', 'c', 'e'])
    expect(findTermUsages(' 검 ', rows, 'ko').map((item) => item.key)).toEqual(['b', 'd'])
  })

  it('띄어 쓰는 원문은 단어 경계로 찾는다', () => {
    const english = [row('x', 'Start the game'), row('y', 'Pixel art')]
    expect(findTermUsages('art', english, 'en').map((item) => item.key)).toEqual(['y'])
  })
})

describe('pickTermExamples', () => {
  it('승인된 번역이 있는 행을 앞에, 같은 순위는 원문 순서로, 개수는 한도까지', () => {
    const usages = findTermUsages('바벨탑', rows, 'ko')
    const translations = byLanguage({
      en: [translation('c', 'Top of the Tower', 'approved'), translation('e', 'The fallen Babel', 'draft'), translation('a', '', 'untranslated')]
    })
    const examples = pickTermExamples(usages, translations, 2)
    expect(examples.map((item) => item.key)).toEqual(['c', 'e'])
    expect(examples[0]?.translations).toEqual({ en: { text: 'Top of the Tower', status: 'approved' } })
    expect(pickTermExamples(usages, translations)[2]).toEqual({ key: 'a', source: '바벨탑에 오른다', context: '프롤로그', translations: {} })
  })
})

describe('프롬프트', () => {
  it('고정 부분은 같은 설정이면 같고, 대상 언어·도구 이름·원문 언어를 밝힌다', () => {
    const prompt = buildTermEntrySystemPrompt(config)
    expect(prompt).toBe(buildTermEntrySystemPrompt(config))
    expect(prompt).toContain('en (English), ja (Japanese)')
    expect(prompt).toContain(TERM_ENTRY_TOOL)
    expect(prompt).toContain('ko (Korean)')
  })

  it('가변 부분은 용어, 사용자가 준 값(빈 칸 표시), 예문과 기존 번역을 담는다', () => {
    const prompt = buildTermEntryPrompt(
      ' 바벨탑 ',
      { pos: '지명', note: '' },
      [{ key: 'c', source: '바벨탑 꼭대기', context: '', translations: { en: { text: 'Top of the Tower', status: 'approved' } } }],
      3
    )
    expect(prompt).toContain('# Term\n바벨탑')
    expect(prompt).toContain('pos: 지명')
    expect(prompt).toContain('note: (empty: fill it in)')
    expect(prompt).toContain('(1 of 3 that contain the term)')
    const json = JSON.parse(prompt.slice(prompt.indexOf('['))) as unknown[]
    expect(json).toEqual([{ key: 'c', source: '바벨탑 꼭대기', translations: { en: { text: 'Top of the Tower', status: 'approved' } } }])
  })
})

describe('judgeTermEntry', () => {
  const good = {
    term: '바벨탑',
    pos: '지명',
    translations: [
      { language: 'en', text: 'Tower of Babel' },
      { language: 'ja', text: 'バベルの塔' }
    ],
    reason: '고유명사',
    confidence: 0.9
  }

  it('같은 용어에 모든 대상 언어 번역이 있으면 받는다', () => {
    const verdict = judgeTermEntry({ term: '바벨탑', item: good, targetLanguages: ['en', 'ja'], final: false })
    expect(verdict.kind === 'accept' && verdict.items).toEqual([
      { term: '바벨탑', pos: '지명', note: '', translations: { en: 'Tower of Babel', ja: 'バベルの塔' }, reason: '고유명사', confidence: 0.9 }
    ])
  })

  it('다른 용어·빠진 번역·모르는 언어는 돌려주고, 마지막에도 남으면 받지 않는다', () => {
    const wrong = { ...good, term: '바벨', translations: [{ language: 'en', text: 'Babel' }, { language: 'fr', text: 'Babel' }] }
    const first = judgeTermEntry({ term: '바벨탑', item: wrong, targetLanguages: ['en', 'ja'], final: false })
    expect(first.kind).toBe('retry')
    if (first.kind === 'retry') {
      expect(first.problems).toContain('term must be exactly "바벨탑"')
      expect(first.problems).toContain('unknown language fr')
      expect(first.problems).toContain('missing translations: ja')
    }
    expect(judgeTermEntry({ term: '바벨탑', item: wrong, targetLanguages: ['en', 'ja'], final: true }).kind).toBe('reject')
  })

  it('대소문자만 다르면 같은 용어로 보고 사용자가 쓴 표기를 지킨다', () => {
    const verdict = judgeTermEntry({
      term: 'Babel',
      item: { ...good, term: 'BABEL' },
      targetLanguages: ['en', 'ja'],
      final: false
    })
    expect(verdict.kind === 'accept' && verdict.items[0]?.term).toBe('Babel')
  })
})

describe('applyTermHints', () => {
  it('사용자가 준 품사·지침·strict 가 앞서고, 비운 칸만 에이전트 값을 쓴다', () => {
    const candidate = { term: 't', pos: 'item', note: '로마자로', translations: {}, reason: '', confidence: 1 }
    expect(applyTermHints(candidate, { pos: ' 지명 ', note: '', strict: true })).toMatchObject({ pos: '지명', note: '로마자로', strict: true })
  })
})

describe('findTermConflicts', () => {
  it('확정 번역을 쓰지 않은 기존 번역 행을 언어별로 모은다(빈 번역은 보지 않는다)', () => {
    const usages = findTermUsages('바벨탑', rows, 'ko')
    const translations = byLanguage({
      en: [translation('a', 'Climb the Tower of Babel'), translation('c', 'Top of the tower'), translation('e', '')],
      ja: [translation('a', 'バベルの塔に登る')]
    })
    expect(findTermConflicts({ en: 'Tower of Babel', ja: 'バベルの塔' }, usages, translations)).toEqual([{ language: 'en', keys: ['c'] }])
  })
})

describe('재번역 프롬프트', () => {
  const examples = [{ key: 'c', source: '바벨탑 꼭대기', context: '', translations: {} }]

  it('지금 번역·지침과 검토자 지시를 더하고, 사용자가 쓴 지시는 그대로 넣는다', () => {
    const prompt = buildTermEntryPrompt('바벨탑', { pos: '지명', note: '' }, examples, 1, {
      translations: { en: 'Babel Tower', ja: '' },
      note: '영어는 Babel Tower 로 쓴다',
      instruction: '  영어는 Tower of Babel 로  '
    })
    expect(prompt).toContain('# Current entry\nen: Babel Tower\nja: (empty)\nnote: 영어는 Babel Tower 로 쓴다')
    expect(prompt).toContain('# Reviewer request\n영어는 Tower of Babel 로')
  })

  it('품사는 그대로 두고, 지침은 새 번역에 맞게 다시 쓰라고 한다', () => {
    const prompt = buildTermEntryPrompt('바벨탑', { pos: '지명', note: '고유명사' }, examples, 1, {
      translations: { en: 'x' },
      note: '',
      instruction: ''
    })
    expect(prompt).toContain('pos: 지명')
    expect(prompt).toContain('note: (rewrite it: see "Current entry")')
    expect(prompt).not.toContain('note: 고유명사')
    expect(prompt).toContain('note: (empty)')
    expect(prompt).toContain('Rewrite note so that it agrees with the new translations')
  })

  it('용어 추가(재번역이 아님)는 사용자가 준 지침을 그대로 둔다', () => {
    expect(buildTermEntryPrompt('바벨탑', { pos: '', note: '고유명사' }, examples, 1)).toContain('note: 고유명사')
  })

  it('지시가 비었으면 더 나은 대안을 달라고 한다', () => {
    const prompt = buildTermEntryPrompt('바벨탑', { pos: '', note: '' }, examples, 1, { translations: { en: 'x' }, note: '', instruction: ' ' })
    expect(prompt).toContain('Offer a better alternative to the current translations.')
  })

  it('원문에 아직 없는 용어는 예문이 없다고 밝힌다', () => {
    const prompt = buildTermEntryPrompt('드래곤', { pos: '', note: '' }, [], 0, { translations: { en: 'Dragon' }, note: '', instruction: '' })
    expect(prompt).toContain('does not appear in the source strings yet')
    expect(prompt).not.toContain('[')
  })
})
