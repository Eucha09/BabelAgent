import { describe, expect, it } from 'vitest'
import { createDefaultProjectConfig } from '@shared/schema/project'
import { collectGlyphs } from './glyphs'

const syntax = createDefaultProjectConfig({ name: 'p', sourceLanguage: 'ko', targetLanguages: ['en'], schemaVersion: 1 }).smartStrings

describe('collectGlyphs', () => {
  it('코드 포인트 순, 중복 없이 모은다', () => {
    expect(collectGlyphs(['banana', 'ab'], syntax)).toBe('abn')
  })

  it('변수 이름과 태그는 빼고 분기 안 리터럴은 넣는다', () => {
    expect(collectGlyphs(['<color=#ff0000>가</color> {player} {n:plural:개|짐}'], syntax)).toBe(' 가개짐')
  })

  it('이스케이프는 푼 글자로 센다', () => {
    expect(collectGlyphs(['{{x}}'], syntax)).toBe('x{}')
  })

  it('줄바꿈·탭은 빼고 공백은 남기며, 이모지는 한 글자로 센다', () => {
    expect(collectGlyphs(['a\nb\tc d', '😀'], syntax)).toBe(' abcd😀')
  })
})
