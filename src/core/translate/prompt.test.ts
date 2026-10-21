import { describe, expect, it } from 'vitest'
import { createDefaultProjectConfig, type ProjectConfig } from '@shared/schema/project'
import type { MasterRow } from '@shared/schema/strings'
import { buildBatchPrompt, buildSystemPrompt, SUBMIT_TOOL } from './prompt'

function config(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    ...createDefaultProjectConfig({ name: 'p', sourceLanguage: 'ko', targetLanguages: ['en'], schemaVersion: 1 }),
    ...overrides
  }
}

const row = (key: string, extra: Partial<MasterRow> = {}): MasterRow => ({
  key,
  source: `원문 ${key}`,
  context: '',
  ui_type: '',
  max_len: '',
  vars: '',
  tags: '',
  source_hash: 'h',
  ...extra
})

describe('buildSystemPrompt', () => {
  it('같은 설정이면 문자 하나까지 같다(프롬프트 캐싱)', () => {
    expect(buildSystemPrompt(config(), 'en')).toBe(buildSystemPrompt(config(), 'en'))
  })

  it('원문 언어와 대상 언어를 밝힌다', () => {
    const prompt = buildSystemPrompt(config(), 'ja')
    expect(prompt).toContain('ko (Korean)')
    expect(prompt).toContain('ja (Japanese)')
  })

  it('제출 도구 이름을 쓴다', () => {
    expect(buildSystemPrompt(config(), 'en')).toContain(SUBMIT_TOOL)
  })

  it('스타일 규칙은 추가 순서가 아니라 id 순', () => {
    const rules = [
      { id: 'r2', text: '둘째 규칙', createdAt: '2026-10-20' },
      { id: 'r1', text: '첫째 규칙', createdAt: '2026-10-21' }
    ]
    const prompt = buildSystemPrompt(config({ styleRules: rules }), 'en')
    expect(prompt.indexOf('첫째 규칙')).toBeLessThan(prompt.indexOf('둘째 규칙'))
  })

  it('게임 소개와 톤 가이드를 넣고, 비어 있으면 표시한다', () => {
    const filled = buildSystemPrompt(
      config({ game: { genre: 'RPG', intro: '바벨탑을 오르는 이야기', toneGuide: '담담하게' } }),
      'en'
    )
    expect(filled).toContain('바벨탑을 오르는 이야기')
    expect(filled).toContain('Genre: RPG')
    expect(filled).toContain('담담하게')
    expect(buildSystemPrompt(config(), 'en')).toContain('(not provided)')
  })
})

describe('buildBatchPrompt', () => {
  it('모든 키를 담고 빈 열은 뺀다', () => {
    const prompt = buildBatchPrompt([row('a', { context: '버튼' }), row('b')], [])
    expect(prompt).toContain('"key": "a"')
    expect(prompt).toContain('"context": "버튼"')
    expect(prompt).toContain('"key": "b"')
    expect(prompt).not.toContain('"ui_type"')
    expect(prompt).toContain('# Strings (2)')
  })

  it('용어가 없으면 none', () => {
    expect(buildBatchPrompt([row('a')], [])).toContain('(none)')
  })

  it('넘겨 받은 용어만 넣는다', () => {
    const prompt = buildBatchPrompt([row('a')], [{ term: '물약', translation: 'Potion', note: '', strict: false }])
    expect(prompt).toContain('- 물약 → Potion')
  })
})
