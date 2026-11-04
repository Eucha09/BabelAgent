import { describe, expect, it } from 'vitest'
import type { QaRuleId } from '@shared/schema/qa'
import { DEFAULT_SMART_FORMATTERS } from './formatters'
import { checkRow, hasErrors, type QaContext, type QaRowInput } from './check'
import { ko } from '@shared/i18n/ko'
import { en } from '@shared/i18n/en'

const ctx: QaContext = {
  smart: {
    enabled: true,
    formatters: [...DEFAULT_SMART_FORMATTERS],
    alternativeEscaping: false,
    escapeChar: '\\',
    convertCharacterStringLiterals: false,
    caseSensitive: true
  },
  sourceLanguage: 'en',
  targetLanguage: 'ko',
  glossary: [
    { term: 'Potion', translation: '물약', strict: false },
    { term: 'Babel', translation: '바벨', strict: true }
  ]
}

function row(source: string, text: string | null, extra: Partial<QaRowInput> = {}): QaRowInput {
  return {
    key: 'k',
    source,
    sourceHash: 'h',
    maxLen: '',
    vars: '',
    translation: text === null ? null : { text, status: 'draft', sourceHash: 'h' },
    ...extra
  }
}

const rules = (input: QaRowInput, context = ctx): QaRuleId[] => checkRow(input, context, ko).map((item) => item.ruleId)

describe('checkRow', () => {
  it('문제가 없으면 진단이 없다', () => {
    expect(checkRow(row('Hi {name}, <b>go</b>', '안녕 {name}, <b>가자</b>'), ctx, ko)).toEqual([])
  })

  it('번역이 없는 행은 원문 메타만 본다', () => {
    expect(rules(row('Hi {name}', null))).toEqual([])
    expect(rules(row('Hi {name}', null, { vars: '[{"name":"nmae"}]' }))).toEqual(['var.meta_mismatch'])
  })

  it('untranslated 로 비어 있으면 검사하지 않는다', () => {
    expect(rules(row('Hi', '', { translation: { text: '', status: 'untranslated', sourceHash: 'h' } }))).toEqual([])
  })

  it('text.empty: 상태가 untranslated 가 아닌데 비었다', () => {
    const result = checkRow(row('Hi', '  '), ctx, ko)
    expect(result.map((item) => [item.ruleId, item.severity])).toEqual([['text.empty', 'error']])
  })

  it('status.stale: 상태 또는 해시 불일치', () => {
    expect(rules(row('Hi', '안녕', { translation: { text: '안녕', status: 'stale', sourceHash: 'h' } }))).toEqual(['status.stale'])
    expect(rules(row('Hi', '안녕', { translation: { text: '안녕', status: 'draft', sourceHash: 'old' } }))).toEqual(['status.stale'])
  })

  it('var.missing / var.extra 는 오류', () => {
    const result = checkRow(row('{a} {b}', '{a} {c}'), ctx, ko)
    expect(result.map((item) => [item.ruleId, item.severity, item.items])).toEqual([
      ['var.missing', 'error', ['b']],
      ['var.extra', 'error', ['c']]
    ])
  })

  it('포매터 분기 수가 달라도 허용한다', () => {
    expect(rules(row('{count:plural:one|other}', '{count:plural:one|few|many|other}'))).toEqual([])
  })

  it('포매터 이름 생략은 원문과 달라도 무시한다', () => {
    expect(rules(row('{0:plural:a|b}', '{0:a|b}'))).toEqual([])
  })

  it('smart.brace_unbalanced', () => {
    const result = checkRow(row('{a}', '{a'), ctx, ko)
    expect(result.map((item) => item.ruleId)).toEqual(['smart.brace_unbalanced'])
    expect(result[0]?.detail).toContain('닫히지 않은 {')
  })

  it('닫히지 않은 플레이스홀더 뒤의 글을 변수 이름으로 읽지 않는다', () => {
    expect(rules(row('{0}골드를 받았습니다', 'Received {0 gold'))).toEqual(['smart.brace_unbalanced'])
  })

  it('smart.unknown_formatter 는 경고, 목록은 project 설정을 따른다', () => {
    const result = checkRow(row('{0:myfmt:x}', '{0:myfmt:y}'), ctx, ko)
    expect(result.map((item) => [item.ruleId, item.severity])).toEqual([['smart.unknown_formatter', 'warning']])
    expect(rules(row('{0:myfmt:x}', '{0:myfmt:y}'), { ...ctx, smart: { ...ctx.smart, formatters: ['myfmt'] } })).toEqual([])
  })

  it('포매터 이름 조회는 caseSensitive 를 따른다', () => {
    expect(rules(row('{0:Plural:a|b}', '{0:Plural:a|b}'))).toEqual(['smart.unknown_formatter'])
    expect(rules(row('{0:Plural:a|b}', '{0:Plural:a|b}'), { ...ctx, smart: { ...ctx.smart, caseSensitive: false } })).toEqual([])
  })

  it('smartStrings.enabled 가 꺼져 있으면 포매터 이름은 보지 않는다', () => {
    expect(rules(row('{0:myfmt:x}', '{0:myfmt:y}'), { ...ctx, smart: { ...ctx.smart, enabled: false } })).toEqual([])
  })

  it('변수 이름 비교는 caseSensitive 를 따른다', () => {
    expect(rules(row('{Name}', '{name}'))).toEqual(['var.missing', 'var.extra'])
    expect(rules(row('{Name}', '{name}'), { ...ctx, smart: { ...ctx.smart, caseSensitive: false } })).toEqual([])
  })

  it('이스케이프 설정을 따른다 — alternativeEscaping 이면 {{ 는 이스케이프가 아니다', () => {
    const alternative = { ...ctx, smart: { ...ctx.smart, alternativeEscaping: true } }
    expect(rules(row('\\{x\\}', '\\{x\\}'), alternative)).toEqual([])
    expect(rules(row('\\{x\\}', '{{x}}'), alternative)).toEqual(['smart.brace_unbalanced', 'var.extra'])
    expect(rules(row('{{x}}', '{{x}}'))).toEqual([])
  })

  it('tag.set_mismatch / tag.unclosed', () => {
    expect(rules(row('<color=#ff0000>a</color>', '<color=#00ff00>a</color>'))).toEqual(['tag.set_mismatch'])
    expect(rules(row('<b>a</b>', '<b>a'))).toEqual(['tag.unclosed'])
    expect(rules(row('<b><i>a</i></b>', '<b><i>a</b></i>'))).toEqual(['tag.unclosed'])
  })

  it('len.over_max 는 example 로 계산하고 가정을 detail 에 남긴다', () => {
    const input = row('Hi {name}', '안녕하세요 {name}님', {
      maxLen: '8',
      vars: '[{"name":"name","example":"바벨"}]'
    })
    const result = checkRow(input, ctx, ko)
    expect(result.map((item) => item.message)).toEqual(['길이 초과: 9 / 8자'])
    expect(result[0]?.detail).toContain('{name} = "바벨"')
    expect(rules({ ...input, maxLen: '9' })).toEqual([])
  })

  it('진단 문구는 넘긴 카탈로그의 언어로 쓴다', () => {
    const input = row('Hi {name}', '안녕하세요 {name}님', { maxLen: '8', vars: '[{"name":"name","example":"바벨"}]' })
    expect(checkRow(input, ctx, en).map((item) => item.message)).toEqual(['Too long: 9 / 8 chars'])
    expect(checkRow(row('Hi {name}', '안녕'), ctx, en).map((item) => item.message)).toEqual([
      'Source variables missing from the translation: {name}'
    ])
  })

  it('glossary.violation 은 경고, strict 면 오류', () => {
    const result = checkRow(row('Babel Potion', '바벨의 포션'), ctx, ko)
    expect(result.map((item) => [item.ruleId, item.severity])).toEqual([['glossary.violation', 'warning']])
    const strict = checkRow(row('Babel Potion', '탑의 물약'), ctx, ko)
    expect(strict.map((item) => [item.ruleId, item.severity])).toEqual([['glossary.violation_strict', 'error']])
  })

  it('var.meta_invalid / var.meta_mismatch 는 경고', () => {
    const invalid = checkRow(row('{a}', '{a}', { vars: 'not json' }), ctx, ko)
    expect(invalid.map((item) => [item.ruleId, item.severity])).toEqual([['var.meta_invalid', 'warning']])
    expect(rules(row('{a}', '{a}', { vars: '[{"name":"a"}]' }))).toEqual([])
  })

  it('hasErrors', () => {
    expect(hasErrors(checkRow(row('{a}', '{b}'), ctx, ko))).toBe(true)
    expect(hasErrors(checkRow(row('Potion', '포션'), ctx, ko))).toBe(false)
  })
})
