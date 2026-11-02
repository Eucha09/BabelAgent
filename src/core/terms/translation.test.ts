import { describe, expect, it } from 'vitest'
import type { GlossaryEntry } from '@shared/schema/glossary'
import { createDefaultProjectConfig } from '@shared/schema/project'
import {
  buildTermTranslateBatches,
  buildTermTranslateBatchPrompt,
  buildTermTranslateSystemPrompt,
  fillTermTranslations,
  findTranslateTargets,
  judgeTermTranslations,
  TERM_TRANSLATE_TOOL,
  type SubmittedTermTranslation,
  type TermTranslateTarget
} from './translation'
import { TERM_STYLE_LINE } from './addition'

const config = createDefaultProjectConfig({ name: 'p', sourceLanguage: 'ko', targetLanguages: ['en', 'ja'], schemaVersion: 1 })

function entry(term: string, translations: Record<string, string>, patch: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return { term, translations, pos: '', note: '', strict: false, status: 'approved', pendingLanguages: [], reason: '', confidence: '', ...patch }
}

describe('findTranslateTargets', () => {
  const entries = [
    entry('바벨탑', { en: 'Tower of Babel', ja: '' }),
    entry('물약', { en: '', ja: '' }, { status: 'pending' }),
    entry('검', { en: 'Sword', ja: '剣' })
  ]

  it('고른 언어 중 빈 언어만, 승인·대기 용어 모두', () => {
    expect(findTranslateTargets(entries, ['en', 'ja'])).toEqual([
      { term: '바벨탑', languages: ['ja'] },
      { term: '물약', languages: ['en', 'ja'] }
    ])
    expect(findTranslateTargets(entries, ['en'])).toEqual([{ term: '물약', languages: ['en'] }])
  })

  it('only 를 주면 그 용어만(대소문자 무시)', () => {
    expect(findTranslateTargets(entries, ['ja'], new Set(['물약']))).toEqual([{ term: '물약', languages: ['ja'] }])
  })

  it('공백만 있는 칸도 빈 칸이다', () => {
    expect(findTranslateTargets([entry('검', { en: '  ' })], ['en'])).toEqual([{ term: '검', languages: ['en'] }])
  })
})

describe('buildTermTranslateBatches', () => {
  it('순서대로 나누고 번호를 1부터 붙인다', () => {
    const targets = ['a', 'b', 'c', 'd', 'e'].map((term) => ({ term, languages: ['en'] }))
    const batches = buildTermTranslateBatches(targets, 2)
    expect(batches.map((batch) => [batch.id, batch.targets.map((target) => target.term).join('')])).toEqual([
      [1, 'ab'],
      [2, 'cd'],
      [3, 'e']
    ])
    expect(buildTermTranslateBatches([], 2)).toEqual([])
  })
})

describe('프롬프트', () => {
  it('고정 부분은 같은 설정이면 같고, 대상 언어를 바꿔도 그대로다', () => {
    const prompt = buildTermTranslateSystemPrompt(config)
    expect(prompt).toBe(buildTermTranslateSystemPrompt({ ...config, targetLanguages: ['en', 'ja', 'fr'] }))
    expect(prompt).toContain(TERM_TRANSLATE_TOOL)
    expect(prompt).toContain('ko (Korean)')
  })

  it('톤 가이드와 스타일 규칙(id 순)을 넣고, 용어 표기에 해당하는 규칙만 따르라고 한다', () => {
    const styled = {
      ...config,
      game: { ...config.game, toneGuide: '담담하게' },
      styleRules: [
        { id: 'r2', text: '영어 고유명사는 Title Case', createdAt: '2026-11-02' },
        { id: 'r1', text: 'NPC 대사는 반말', createdAt: '2026-11-01' }
      ]
    }
    const prompt = buildTermTranslateSystemPrompt(styled)
    expect(prompt).toContain('담담하게')
    expect(prompt).toContain('# Style rules')
    expect(prompt.indexOf('NPC 대사는 반말')).toBeLessThan(prompt.indexOf('영어 고유명사는 Title Case'))
    expect(prompt).toContain(TERM_STYLE_LINE)
    expect(buildTermTranslateSystemPrompt(config)).toContain('# Style rules\n(not provided)')
  })

  it('가변 부분은 쓰는 언어와 용어마다 채울 언어·참고 번역·예문을 담는다', () => {
    const prompt = buildTermTranslateBatchPrompt([
      {
        term: '바벨탑',
        pos: '지명',
        note: '',
        translateTo: ['ja'],
        known: { en: 'Tower of Babel', fr: '' },
        examples: [{ key: 'a', source: '바벨탑에 오른다', context: '', translations: { en: { text: 'Climb the Tower of Babel', status: 'approved' } } }],
        found: 5
      },
      { term: '물약', pos: '', note: '소모품', translateTo: ['en', 'ja'], known: {}, examples: [], found: 0 }
    ])
    expect(prompt).toContain('ja (Japanese)')
    expect(prompt).toContain('en (English)')
    const json = JSON.parse(prompt.slice(prompt.indexOf('['))) as Record<string, unknown>[]
    expect(json[0]).toEqual({
      term: '바벨탑',
      pos: '지명',
      translate_to: ['ja'],
      known_translations: { en: 'Tower of Babel' },
      examples: [{ key: 'a', source: '바벨탑에 오른다', translations: { en: { text: 'Climb the Tower of Babel', status: 'approved' } } }],
      examples_shown: '1 of 5'
    })
    expect(json[1]).toEqual({
      term: '물약',
      note: '소모품',
      translate_to: ['en', 'ja'],
      examples: 'not found in the source strings; rely on the game description'
    })
  })
})

describe('judgeTermTranslations', () => {
  const targets: TermTranslateTarget[] = [
    { term: '바벨탑', languages: ['ja'] },
    { term: 'Mana', languages: ['en', 'ja'] }
  ]
  const item = (term: string, pairs: [string, string][]): SubmittedTermTranslation => ({
    term,
    translations: pairs.map(([language, text]) => ({ language, text })),
    confidence: 0.9
  })

  it('모두 맞으면 받고, 채울 언어가 아닌 번역은 버린다', () => {
    const verdict = judgeTermTranslations({
      items: [item('바벨탑', [['ja', ' バベルの塔 '], ['en', 'Babel']]), item('mana', [['en', 'Mana'], ['ja', 'マナ']])],
      targets,
      final: false
    })
    expect(verdict).toEqual({
      kind: 'accept',
      items: [
        { term: '바벨탑', translations: { ja: 'バベルの塔' }, reason: '', confidence: 0.9 },
        { term: 'Mana', translations: { en: 'Mana', ja: 'マナ' }, reason: '', confidence: 0.9 }
      ],
      remarks: null,
      remarkCount: 0
    })
  })

  it('빠진 용어·빈 번역·배치에 없는 용어·겹침은 첫 제출이면 돌려준다', () => {
    const verdict = judgeTermTranslations({
      items: [item('바벨탑', [['ja', '']]), item('드래곤', [['ja', 'ドラゴン']]), item('바벨탑', [['ja', 'x']])],
      targets,
      final: false
    })
    expect(verdict.kind).toBe('retry')
    expect(verdict.kind === 'retry' && verdict.problems).toBe(
      '"바벨탑": missing translations: ja; "드래곤": not in this batch; "바벨탑": duplicate; missing terms: "Mana"'
    )
  })

  it('마지막 제출은 문제없는 용어만 받고, 하나도 없으면 거부한다', () => {
    const last = judgeTermTranslations({ items: [item('바벨탑', [['ja', 'バベルの塔']])], targets, final: true })
    expect(last.kind === 'accept' && last.items.map((result) => result.term)).toEqual(['바벨탑'])
    expect(last.kind === 'accept' && last.remarkCount).toBe(1)
    expect(judgeTermTranslations({ items: [], targets, final: true }).kind).toBe('reject')
  })
})

describe('fillTermTranslations', () => {
  const records = (): Record<string, string>[] => [
    { term: '바벨탑', translation_en: 'Tower of Babel', translation_ja: '', status: 'approved', memo: '사용자 열' },
    { term: '물약', translation_en: '', translation_ja: '', status: 'pending' },
    { term: '검', translation_en: 'Sword', translation_ja: '', status: '', pending_languages: 'fr' }
  ]

  it('빈 칸만 채우고, 승인된 용어는 채운 언어를 승인 대기로 표시한다', () => {
    const result = fillTermTranslations(records(), [
      { term: '바벨탑', translations: { ja: 'バベルの塔' } },
      { term: '물약', translations: { en: 'Potion', ja: 'ポーション' } },
      { term: '검', translations: { en: 'Blade', ja: '剣' } }
    ])
    expect(result.records[0]).toEqual({
      term: '바벨탑',
      translation_en: 'Tower of Babel',
      translation_ja: 'バベルの塔',
      status: 'approved',
      memo: '사용자 열',
      pending_languages: 'ja'
    })
    // 승인 대기 용어는 pending_languages 를 쓰지 않는다(용어 전체 승인으로 함께 확정)
    expect(result.records[1]).toEqual({ term: '물약', translation_en: 'Potion', translation_ja: 'ポーション', status: 'pending' })
    // 이미 있는 번역(en)은 덮지 않고, 있던 대기 언어에 더한다
    expect(result.records[2]).toMatchObject({ translation_en: 'Sword', translation_ja: '剣', pending_languages: 'fr;ja' })
    expect(result.filled).toEqual([
      { term: '바벨탑', languages: ['ja'] },
      { term: '물약', languages: ['en', 'ja'] },
      { term: '검', languages: ['ja'] }
    ])
    expect(result.skipped).toEqual([])
  })

  it('사라진 용어나 그 사이 채워진 칸만 받은 용어는 건너뛴다', () => {
    const result = fillTermTranslations(records(), [
      { term: '드래곤', translations: { ja: 'ドラゴン' } },
      { term: '바벨탑', translations: { en: 'Babel' } }
    ])
    expect(result.filled).toEqual([])
    expect(result.skipped).toEqual(['드래곤', '바벨탑'])
    expect(result.records).toEqual(records())
  })
})
