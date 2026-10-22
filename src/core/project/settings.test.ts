import { describe, expect, it } from 'vitest'
import { ProjectConfig, ProjectSettingsPatch, createDefaultProjectConfig } from '@shared/schema/project'
import { applySettingsPatch, settingsChanged } from './settings'

const base = createDefaultProjectConfig({ name: 'p', sourceLanguage: 'ko', targetLanguages: ['en'], schemaVersion: 1 })

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
  it('패치에 있는 항목만 바꾼다', () => {
    expect(applySettingsPatch(base, { translate: { effort: 'high' } }).translate).toEqual({ model: 'opus', effort: 'high' })
    expect(applySettingsPatch(base, { translate: { model: 'sonnet' } }).translate).toEqual({ model: 'sonnet', effort: 'medium' })
  })

  it('다른 설정은 그대로 둔다', () => {
    const next = applySettingsPatch(base, { translate: { model: 'haiku' } })
    expect(next.smartStrings).toBe(base.smartStrings)
    expect(next.batch).toBe(base.batch)
  })

  it('빈 패치는 그대로', () => {
    expect(applySettingsPatch(base, {})).toBe(base)
    expect(settingsChanged(base, applySettingsPatch(base, { translate: { model: 'opus' } }))).toBe(false)
    expect(settingsChanged(base, applySettingsPatch(base, { translate: { effort: 'max' } }))).toBe(true)
  })

  it('패치 스키마는 화면에서 고칠 수 있는 항목만 받는다', () => {
    expect(ProjectSettingsPatch.safeParse({ translate: { model: 'gpt' } }).success).toBe(false)
    expect(ProjectSettingsPatch.parse({ name: 'x', translate: { effort: 'low' } })).toEqual({ translate: { effort: 'low' } })
  })
})
