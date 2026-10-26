import { describe, expect, it } from 'vitest'
import { ProjectConfig, ProjectSettingsPatch, createDefaultProjectConfig } from '@shared/schema/project'
import { fromProjectForm, splitList, toProjectForm } from './form'
import {
  applySettingsPatch,
  buildSettingsPatch,
  isLanguageTag,
  nextStyleRuleId,
  settingsChanged,
  validateProjectSettings
} from './settings'

const base = createDefaultProjectConfig({ name: 'p', sourceLanguage: 'ko', targetLanguages: ['en'], schemaVersion: 1 })

const fields = (config: ProjectConfig): string[] => validateProjectSettings(config).map((problem) => problem.field)

describe('번역 설정 기본값', () => {
  it('새 프로젝트는 Opus · 중간', () => {
    expect(base.translate).toEqual({ model: 'opus', effort: 'medium' })
  })

  it('translate 가 없는 옛 project.json 도 Opus · 중간으로 읽는다', () => {
    const parsed = ProjectConfig.parse({ schemaVersion: 1, name: 'p', sourceLanguage: 'ko' })
    expect(parsed.translate).toEqual({ model: 'opus', effort: 'medium' })
  })

  it('모델만 기억한 project.json(M3)은 고른 모델을 지키고 사고 수준만 중간으로 채운다', () => {
    const parsed = ProjectConfig.parse({ schemaVersion: 1, name: 'p', sourceLanguage: 'ko', translate: { model: 'haiku' } })
    expect(parsed.translate).toEqual({ model: 'haiku', effort: 'medium' })
  })

  it('모르는 사고 수준은 거부한다', () => {
    const result = ProjectConfig.safeParse({ schemaVersion: 1, name: 'p', sourceLanguage: 'ko', translate: { effort: 'huge' } })
    expect(result.success).toBe(false)
  })
})

describe('applySettingsPatch', () => {
  it('묶음 안에서는 패치에 있는 항목만 바꾼다', () => {
    expect(applySettingsPatch(base, { translate: { effort: 'high' } }).translate).toEqual({ model: 'opus', effort: 'high' })
    expect(applySettingsPatch(base, { game: { intro: '소개' } }).game).toEqual({ genre: '', intro: '소개', toneGuide: '' })
    expect(applySettingsPatch(base, { batch: { concurrency: 3 } }).batch).toEqual({ maxRows: 30, maxSourceChars: 3000, concurrency: 3 })
  })

  it('배열은 통째로 바꾸고, 다른 묶음은 그대로 둔다', () => {
    const next = applySettingsPatch(base, { targetLanguages: ['ja', 'zh-Hans'] })
    expect(next.targetLanguages).toEqual(['ja', 'zh-Hans'])
    expect(next.smartStrings).toEqual(base.smartStrings)
    expect(next.schemaVersion).toBe(1)
  })

  it('빈 패치는 바뀐 것이 없다', () => {
    expect(settingsChanged(base, applySettingsPatch(base, {}))).toBe(false)
    expect(settingsChanged(base, applySettingsPatch(base, { translate: { model: 'opus' } }))).toBe(false)
    expect(settingsChanged(base, applySettingsPatch(base, { translate: { effort: 'max' } }))).toBe(true)
  })

  it('패치 스키마는 화면에서 고칠 수 있는 항목만 받는다', () => {
    expect(ProjectSettingsPatch.safeParse({ translate: { model: 'gpt' } }).success).toBe(false)
    expect(ProjectSettingsPatch.parse({ schemaVersion: 9, grammar: {}, translate: { effort: 'low' } })).toEqual({ translate: { effort: 'low' } })
  })
})

describe('buildSettingsPatch', () => {
  it('컨텍스트 설정도 바뀌었을 때만 담고, 옛 project.json 은 기본값으로 열린다', () => {
    const next = { ...base, context: { maxLenRatio: 3 } }
    expect(buildSettingsPatch(base, next)).toEqual({ context: { maxLenRatio: 3 } })
    const { context: _omitted, ...old } = base
    expect(ProjectConfig.parse(old).context).toEqual({ maxLenRatio: 2.5 })
  })

  it('바뀐 묶음만 담는다', () => {
    const next = { ...base, game: { ...base.game, toneGuide: '담담하게' }, batch: { ...base.batch, maxRows: 20 } }
    expect(buildSettingsPatch(base, next)).toEqual({ game: next.game, batch: next.batch })
    expect(buildSettingsPatch(base, base)).toEqual({})
  })

  it('패치를 다른 사람이 고친 최신 설정에 합치면, 내가 고치지 않은 묶음의 변경이 남는다', () => {
    const mine = { ...base, game: { ...base.game, intro: '내 소개' } }
    const outside = { ...base, review: { lowConfidence: 0.5 } }
    const merged = applySettingsPatch(outside, buildSettingsPatch(base, mine))
    expect(merged.game.intro).toBe('내 소개')
    expect(merged.review.lowConfidence).toBe(0.5)
  })
})

describe('validateProjectSettings', () => {
  it('기본 설정은 문제가 없다', () => {
    expect(validateProjectSettings(base)).toEqual([])
  })

  it('이름과 언어 코드', () => {
    expect(fields({ ...base, name: '  ' })).toEqual(['name'])
    expect(fields({ ...base, sourceLanguage: '한국어' })).toEqual(['sourceLanguage'])
    expect(fields({ ...base, targetLanguages: ['en', 'EN'] })).toEqual(['targetLanguages'])
    expect(fields({ ...base, targetLanguages: ['ko'] })).toEqual(['targetLanguages'])
    expect(fields({ ...base, targetLanguages: ['english!'] })).toEqual(['targetLanguages'])
    expect(fields({ ...base, targetLanguages: [] })).toEqual([])
  })

  it('배치 · 검토 숫자', () => {
    expect(fields({ ...base, batch: { maxRows: 0, maxSourceChars: 1.5, concurrency: 4 } })).toEqual([
      'batch.maxRows',
      'batch.maxSourceChars',
      'batch.concurrency'
    ])
    expect(fields({ ...base, review: { lowConfidence: 1.2 } })).toEqual(['review.lowConfidence'])
    expect(fields({ ...base, review: { lowConfidence: Number.NaN } })).toEqual(['review.lowConfidence'])
  })

  it('max_len 배수는 1~10', () => {
    expect(base.context.maxLenRatio).toBe(2.5)
    expect(fields({ ...base, context: { maxLenRatio: 1 } })).toEqual([])
    expect(fields({ ...base, context: { maxLenRatio: 0.8 } })).toEqual(['context.maxLenRatio'])
    expect(fields({ ...base, context: { maxLenRatio: 11 } })).toEqual(['context.maxLenRatio'])
  })

  it('스타일 규칙', () => {
    const rule = { id: 'r1', text: '반말', createdAt: '2026-10-22' }
    expect(fields({ ...base, styleRules: [{ ...rule, text: ' ' }] })).toEqual(['styleRules'])
    expect(fields({ ...base, styleRules: [rule, { ...rule, text: '존댓말' }] })).toEqual(['styleRules'])
  })

  it('Smart Strings', () => {
    const smart = base.smartStrings
    expect(fields({ ...base, smartStrings: { ...smart, escapeChar: '' } })).toEqual(['smartStrings.escapeChar'])
    expect(fields({ ...base, smartStrings: { ...smart, escapeChar: '{' } })).toEqual(['smartStrings.escapeChar'])
    expect(fields({ ...base, smartStrings: { ...smart, formatters: ['plural', 'my-fmt'] } })).toEqual(['smartStrings.formatters'])
  })
})

describe('isLanguageTag', () => {
  it('BCP 47 태그', () => {
    for (const code of ['ko', 'en', 'zh-Hans', 'pt-BR', 'ja']) expect(isLanguageTag(code)).toBe(true)
    for (const code of ['', ' en', '한국어', 'english!', 'e']) expect(isLanguageTag(code)).toBe(false)
  })
})

describe('nextStyleRuleId', () => {
  it('r + 가장 큰 번호 + 1', () => {
    expect(nextStyleRuleId([])).toBe('r1')
    expect(nextStyleRuleId([{ id: 'r2', text: 'a', createdAt: '' }, { id: 'custom', text: 'b', createdAt: '' }, { id: 'r10', text: 'c', createdAt: '' }])).toBe('r11')
  })
})

describe('프로젝트 화면 입력', () => {
  it('설정 → 입력 → 설정이 그대로 돌아온다', () => {
    const { config, problems } = fromProjectForm(toProjectForm(base), base)
    expect(problems).toEqual([])
    expect(settingsChanged(base, config)).toBe(false)
  })

  it('목록 칸은 쉼표·줄바꿈·공백으로 나눈다', () => {
    expect(splitList('en, ja\nzh-Hans  ,, ')).toEqual(['en', 'ja', 'zh-Hans'])
  })

  it('숫자 칸이 비거나 숫자가 아니면 그 칸의 문제로 알린다', () => {
    const form = { ...toProjectForm(base), maxRows: '', lowConfidence: 'abc' }
    expect(fromProjectForm(form, base).problems.map((problem) => problem.field)).toEqual(['batch.maxRows', 'review.lowConfidence'])
  })

  it('화면에 없는 항목은 base 에서 가져온다', () => {
    const withGrammar = { ...base, grammar: { enabled: true, tables: ['grammar_ko_particles.csv'] } }
    expect(fromProjectForm(toProjectForm(withGrammar), withGrammar).config.grammar).toEqual(withGrammar.grammar)
  })
})
