import { describe, expect, it } from 'vitest'
import { createDefaultProjectConfig } from '@shared/schema/project'
import type { MasterRow } from '@shared/schema/strings'
import { buildTermsBatchPrompt, buildTermsSystemPrompt, TERMS_TOOL } from './prompt'
import { checkTerms, judgeTerms, type SubmittedTerm } from './submission'

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

describe('프롬프트', () => {
  it('고정 부분은 같은 설정이면 같고, 대상 언어·도구 이름을 밝힌다', () => {
    const prompt = buildTermsSystemPrompt(config)
    expect(prompt).toBe(buildTermsSystemPrompt(config))
    expect(prompt).toContain('en (English), ja (Japanese)')
    expect(prompt).toContain(TERMS_TOOL)
  })

  it('가변 부분은 이미 있는 용어와 문자열을 담는다', () => {
    const prompt = buildTermsBatchPrompt([row('a', '바벨탑에 오른다', '프롤로그'), row('b', '시작')], ['바벨탑'])
    expect(prompt).toContain('- 바벨탑')
    const json = JSON.parse(prompt.slice(prompt.indexOf('['))) as Record<string, string>[]
    expect(json).toEqual([
      { key: 'a', source: '바벨탑에 오른다', context: '프롤로그' },
      { key: 'b', source: '시작' }
    ])
    expect(buildTermsBatchPrompt([row('b', '시작')], [])).toContain('(none)')
  })
})

describe('checkTerms', () => {
  const sources = { texts: ['바벨탑에 오른 기사', 'Use a Mana Potion'], language: 'ko' }
  const term = (text: string, patch: Partial<SubmittedTerm> = {}): SubmittedTerm => ({ term: text, confidence: 0.8, ...patch })

  it('원문에 나오는 새 용어만 받고 번역을 언어별로 담는다', () => {
    const result = checkTerms({
      items: [term(' 바벨탑 ', { pos: '지명', translations: [{ language: 'en', text: ' Tower of Babel ' }] })],
      targetLanguages: ['en', 'ja'],
      existing: new Set(),
      sources
    })
    expect(result.valid).toEqual([
      { term: '바벨탑', pos: '지명', note: '', translations: { en: 'Tower of Babel' }, reason: '', confidence: 0.8 }
    ])
    expect(result.issues).toEqual([])
  })

  it('원문에 없는 용어·자리표시자·겹친 후보·모르는 언어는 문제로, 이미 있는 용어는 조용히 뺀다', () => {
    const result = checkTerms({
      items: [
        term('드래곤'),
        term('{playerName}'),
        term('기사'),
        term('기사'),
        term('바벨탑', { translations: [{ language: 'fr', text: 'Babel' }] }),
        term('Mana Potion')
      ],
      targetLanguages: ['en', 'ja'],
      existing: new Set(['mana potion']),
      sources
    })
    expect(result.valid.map((item) => item.term)).toEqual(['기사'])
    expect(result.known).toEqual(['Mana Potion'])
    expect(result.issues).toEqual([
      '"드래곤": not found in the source strings',
      '"{playerName}": placeholders and tags are not glossary terms',
      '"기사": duplicate',
      '"바벨탑": unknown language fr (use en, ja)'
    ])
  })

  it('원문 문자열을 주지 않으면(패널 제안) 등장 여부를 보지 않는다', () => {
    const result = checkTerms({ items: [term('드래곤')], targetLanguages: ['en'], existing: new Set() })
    expect(result.valid.map((item) => item.term)).toEqual(['드래곤'])
  })

  it('띄어 쓰는 원문은 단어 경계로 찾는다', () => {
    const english = { texts: ['Start the game'], language: 'en' }
    expect(checkTerms({ items: [term('art')], targetLanguages: ['ko'], existing: new Set(), sources: english }).issues).toHaveLength(1)
  })
})

describe('judgeTerms', () => {
  const base = { targetLanguages: ['en'], existing: new Set<string>(), sources: { texts: ['바벨탑'], language: 'ko' } }

  it('빈 목록도 받는다', () => {
    expect(judgeTerms({ ...base, items: [], final: false })).toEqual({ kind: 'accept', items: [], remarks: null, remarkCount: 0 })
  })

  it('첫 제출의 문제는 돌려주고 마지막 제출은 문제없는 후보만 받는다', () => {
    const items: SubmittedTerm[] = [{ term: '바벨탑', confidence: 1 }, { term: '없는 말', confidence: 1 }]
    expect(judgeTerms({ ...base, items, final: false }).kind).toBe('retry')
    const last = judgeTerms({ ...base, items, final: true })
    expect(last.kind === 'accept' && last.items.map((item) => item.term)).toEqual(['바벨탑'])
  })
})
