import { describe, expect, it } from 'vitest'
import { createDefaultProjectConfig } from '@shared/schema/project'
import { formatSmartFlag, hasSmartSyntax, needsSmartSuggestion, parseSmartFlag } from './smart'

const syntax = createDefaultProjectConfig({ name: 'p', sourceLanguage: 'ko', targetLanguages: ['en'], schemaVersion: 1 }).smartStrings

describe('smart 칸', () => {
  it('true/false 는 대소문자·공백을 무시하고, 그 밖은 미정', () => {
    expect(parseSmartFlag('TRUE')).toBe(true)
    expect(parseSmartFlag(' false ')).toBe(false)
    expect(parseSmartFlag('')).toBeNull()
    expect(parseSmartFlag('yes')).toBeNull()
    expect(formatSmartFlag(true)).toBe('true')
  })
})

describe('hasSmartSyntax', () => {
  it('닫힌 플레이스홀더가 있어야 Smart 구문이다', () => {
    expect(hasSmartSyntax('{0}개', syntax)).toBe(true)
    expect(hasSmartSyntax('{name}님', syntax)).toBe(true)
    expect(hasSmartSyntax('{n:plural:개|개}', syntax)).toBe(true)
    expect(hasSmartSyntax('그냥 글', syntax)).toBe(false)
    expect(hasSmartSyntax('{{escaped}}', syntax)).toBe(false)
    expect(hasSmartSyntax('열기만 { 함', syntax)).toBe(false)
  })

  it('이스케이프 방식은 설정을 따른다', () => {
    expect(hasSmartSyntax('\\{x\\}', syntax)).toBe(true)
    expect(hasSmartSyntax('\\{x\\}', { ...syntax, alternativeEscaping: true })).toBe(false)
  })
})

describe('needsSmartSuggestion', () => {
  it('미정이고 구문이 있는 행만 제안한다. false 로 둔 행은 다시 제안하지 않는다', () => {
    expect(needsSmartSuggestion({ source: '{0}개', smart: '' }, syntax)).toBe(true)
    expect(needsSmartSuggestion({ source: '{0}개', smart: 'false' }, syntax)).toBe(false)
    expect(needsSmartSuggestion({ source: '{0}개', smart: 'true' }, syntax)).toBe(false)
    expect(needsSmartSuggestion({ source: '글', smart: '' }, syntax)).toBe(false)
  })
})
