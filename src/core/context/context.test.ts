import { describe, expect, it } from 'vitest'
import { createDefaultProjectConfig } from '@shared/schema/project'
import type { ContextSuggestion } from '@shared/schema/context'
import type { MasterRow } from '@shared/schema/strings'
import { buildContextBatchPrompt, buildContextSystemPrompt, CONTEXT_TOOL } from './prompt'
import { DISPLAY_LENGTH_RULE } from '../translate/prompt'
import { generousMaxLen, judgeContext, MIN_SUGGESTED_MAX_LEN, toSuggestion, type SubmittedContext } from './submission'
import {
  applySuggestionValues,
  fieldValueProblem,
  mergeSuggestions,
  removeSuggestions,
  suggestionsToRecords,
  toSuggestions
} from './suggestions'
import { fillFor, knownUiTypes, selectContextTargets, sourceVariables, type ContextTarget } from './targets'
import { ko } from '@shared/i18n/ko'

const config = createDefaultProjectConfig({ name: 'p', sourceLanguage: 'ko', targetLanguages: ['en'], schemaVersion: 1 })
const syntax = config.smartStrings

const row = (key: string, extra: Partial<MasterRow> = {}): MasterRow => ({
  key,
  source: `원문 ${key}`,
  context: '',
  ui_type: '',
  max_len: '',
  vars: '',
  smart: '',
  tags: '',
  source_hash: `h-${key}`,
  ...extra
})

const suggestion = (key: string, patch: Partial<ContextSuggestion> = {}): ContextSuggestion => ({
  key,
  source_hash: `h-${key}`,
  context: '',
  ui_type: '',
  max_len: '',
  vars: '',
  confidence: '0.9',
  note: '',
  ...patch
})

describe('대상 고르기', () => {
  it('원문의 변수 이름을 코드로 뽑는다', () => {
    expect(sourceVariables('{playerName}님, {count:plural:하나|여럿} 획득', syntax)).toEqual(['playerName', 'count'])
  })

  it('고른 필드 중 빈 칸만, 변수가 없는 원문에는 vars 를 묻지 않는다', () => {
    const fields = ['context', 'ui_type', 'max_len', 'vars'] as const
    expect(fillFor(row('a', { ui_type: 'button' }), fields, [])).toEqual(['context', 'max_len'])
    expect(fillFor(row('a', { context: '상점' }), ['vars', 'context'], ['n'])).toEqual(['vars'])
  })

  it('승인 대기 제안이 있는 행은 다시 돌리지 않고, 선택 범위를 따른다', () => {
    const rows = [row('a'), row('b', { context: '있음' }), row('c'), row('d')]
    const result = selectContextTargets(rows, { fields: ['context'], scope: 'empty', selected: new Set() }, new Set(['c']), syntax)
    expect(result.targets.map((target) => target.row.key)).toEqual(['a', 'd'])
    expect(result.skippedPending).toEqual(['c'])

    const selected = selectContextTargets(rows, { fields: ['context'], scope: 'selected', selected: new Set(['b', 'd']) }, new Set(), syntax)
    expect(selected.targets.map((target) => target.row.key)).toEqual(['d'])
  })

  it('이미 쓰는 ui_type 은 겹치지 않게 정렬해 둔다', () => {
    expect(knownUiTypes([row('a', { ui_type: 'button' }), row('b', { ui_type: ' dialogue ' }), row('c', { ui_type: 'button' }), row('d')])).toEqual([
      'button',
      'dialogue'
    ])
  })
})

describe('프롬프트', () => {
  it('고정 부분은 같은 설정이면 같고, 도구 이름과 원문 언어를 밝힌다', () => {
    const prompt = buildContextSystemPrompt(config)
    expect(prompt).toBe(buildContextSystemPrompt(config))
    expect(prompt).toContain(CONTEXT_TOOL)
    expect(prompt).toContain('ko (Korean)')
  })

  it('max_len 은 번역과 같은 화면 길이 기준으로 잡으라고 알린다', () => {
    expect(buildContextSystemPrompt(config)).toContain(DISPLAY_LENGTH_RULE)
  })

  it('가변 부분은 채울 필드·변수 이름·기존 ui_type 을 담고 빈 열은 뺀다', () => {
    const targets: ContextTarget[] = [
      { row: row('shop.buy', { source: '{item} 구매', ui_type: 'button' }), fill: ['context', 'vars'], variables: ['item'] }
    ]
    const prompt = buildContextBatchPrompt(targets, ['button', 'dialogue'])
    expect(prompt).toContain('button, dialogue')
    const json = JSON.parse(prompt.slice(prompt.indexOf('['))) as Record<string, unknown>[]
    expect(json[0]).toEqual({ key: 'shop.buy', source: '{item} 구매', ui_type: 'button', fill: ['context', 'vars'], variables: ['item'] })
    expect(buildContextBatchPrompt(targets, [])).toContain('(none yet)')
  })
})

describe('judgeContext', () => {
  const targets: ContextTarget[] = [
    { row: row('a'), fill: ['context', 'ui_type'], variables: [] },
    { row: row('b', { source: '{name} {count}' }), fill: ['vars'], variables: ['name', 'count'] }
  ]
  const good: SubmittedContext[] = [
    { key: 'a', context: '메인 메뉴 버튼', ui_type: 'button', confidence: 0.9 },
    { key: 'b', vars: [{ name: 'count', meaning: '개수' }, { name: 'name', meaning: '이름' }], confidence: 0.8 }
  ]

  it('문제가 없으면 모두 받는다', () => {
    const verdict = judgeContext({ targets, entries: good, final: false, caseSensitive: true })
    expect(verdict).toEqual({ kind: 'accept', items: good, remarks: null, remarkCount: 0 })
  })

  it('첫 제출의 문제는 돌려주고, 마지막 제출은 문제없는 항목만 받는다', () => {
    const entries: SubmittedContext[] = [
      { key: 'a', context: ' ', ui_type: 'button', confidence: 0.9 },
      { key: 'b', vars: [{ name: 'name', meaning: '이름' }], confidence: 0.8 },
      { key: 'z', confidence: 0.5 }
    ]
    const first = judgeContext({ targets, entries, final: false, caseSensitive: true })
    expect(first.kind).toBe('retry')
    if (first.kind === 'retry') {
      expect(first.problems).toContain('a: context is missing')
      expect(first.problems).toContain('b: vars must describe exactly these names: name, count')
      expect(first.problems).toContain('unknown key: z')
    }
    const last = judgeContext({ targets, entries: [good[0] as SubmittedContext], final: true, caseSensitive: true })
    expect(last).toMatchObject({ kind: 'accept', items: [good[0]], remarkCount: 1 })
    expect(judgeContext({ targets, entries: [], final: true, caseSensitive: true }).kind).toBe('reject')
  })

  it('caseSensitive 가 꺼져 있으면 변수 이름의 대소문자를 보지 않는다', () => {
    const entries: SubmittedContext[] = [good[0] as SubmittedContext, { key: 'b', vars: [{ name: 'NAME', meaning: '' }, { name: 'Count', meaning: '' }], confidence: 1 }]
    expect(judgeContext({ targets, entries, final: true, caseSensitive: false }).kind).toBe('accept')
    expect(judgeContext({ targets, entries, final: false, caseSensitive: true }).kind).toBe('retry')
  })
})

describe('toSuggestion', () => {
  const rules = { smart: syntax, maxLenRatio: 2.5 }
  const target: ContextTarget = { row: row('b', { source: '{name} {count}' }), fill: ['context', 'max_len', 'vars'], variables: ['name', 'count'] }

  it('요청한 필드만 담고 vars 는 원문 표기와 순서로 만든다', () => {
    const result = toSuggestion(
      {
        key: 'b',
        context: ' 보상 알림 ',
        ui_type: 'message',
        max_len: 20,
        vars: [{ name: 'count', meaning: '개수', type: 'int', example: '3' }, { name: 'name', meaning: '이름', type: ' ' }],
        confidence: 0.666,
        note: ''
      },
      target,
      rules
    )
    expect(result).toEqual({
      key: 'b',
      source_hash: 'h-b',
      context: '보상 알림',
      ui_type: '',
      max_len: '20',
      vars: JSON.stringify([{ name: 'name', meaning: '이름' }, { name: 'count', type: 'int', meaning: '개수', example: '3' }]),
      confidence: '0.67',
      note: ''
    })
  })

  it('담을 값이 없으면 null', () => {
    expect(toSuggestion({ key: 'b', ui_type: 'message', confidence: 0.4 }, { ...target, fill: ['max_len'] }, rules)).toBeNull()
  })
})

describe('max_len 하한', () => {
  const rules = { smart: syntax, maxLenRatio: 2.5 }
  const target = (source: string, vars = ''): ContextTarget => ({ row: row('k', { source, vars }), fill: ['max_len'], variables: [] })

  it('원문 길이 × 배수, 최소 10자', () => {
    expect(generousMaxLen(2, 2.5)).toBe(MIN_SUGGESTED_MAX_LEN)
    expect(generousMaxLen(8, 2.5)).toBe(20)
    expect(generousMaxLen(7, 1.5)).toBe(11)
  })

  it('빡빡한 제안은 하한으로 올리고, 더 넉넉한 제안은 그대로 둔다', () => {
    // "체력 물약 구매" 는 8글자 → 20. 영어 "Buy Health Potion"(17자)이 들어간다
    expect(toSuggestion({ key: 'k', max_len: 12, confidence: 0.9 }, target('체력 물약 구매'), rules)?.max_len).toBe('20')
    expect(toSuggestion({ key: 'k', max_len: 30, confidence: 0.9 }, target('체력 물약 구매'), rules)?.max_len).toBe('30')
    expect(toSuggestion({ key: 'k', max_len: 4, confidence: 0.9 }, target('설정'), rules)?.max_len).toBe('10')
  })

  it('배수는 프로젝트 설정을 따른다', () => {
    expect(toSuggestion({ key: 'k', max_len: 5, confidence: 0.9 }, target('체력 물약 구매'), { ...rules, maxLenRatio: 3 })?.max_len).toBe('24')
  })

  it('원문 길이는 QA 와 같이 센다 — 태그는 빼고 변수는 example 로 바꾼다', () => {
    const tagged = toSuggestion({ key: 'k', max_len: 1, confidence: 0.9 }, target('<b>체력 물약 구매</b>'), rules)
    expect(tagged?.max_len).toBe('20')
    const withExample = toSuggestion(
      { key: 'k', max_len: 1, confidence: 0.9 },
      target('{item} 구매', '[{"name":"item","example":"체력 물약"}]'),
      rules
    )
    expect(withExample?.max_len).toBe('20')
  })
})

describe('제안 파일', () => {
  it('레코드 왕복, 겹친 키는 나중 행', () => {
    const rows = [suggestion('a', { context: '첫' }), suggestion('b')]
    expect(toSuggestions(suggestionsToRecords(rows))).toEqual(rows)
    expect(toSuggestions([{ key: 'a', context: '첫' }, { key: 'a', context: '둘' }])[0]?.context).toBe('둘')
  })

  it('합치기는 같은 키를 그 자리에서 바꾸고 새 키는 뒤에, 지우기는 고른 키만', () => {
    const merged = mergeSuggestions([suggestion('a'), suggestion('b')], [suggestion('b', { context: '새' }), suggestion('c')])
    expect(merged.map((item) => `${item.key}:${item.context}`)).toEqual(['a:', 'b:새', 'c:'])
    expect(removeSuggestions(merged, ['a', 'c']).map((item) => item.key)).toEqual(['b'])
  })
})

describe('applySuggestionValues', () => {
  const rows = [row('a'), row('b', { context: '사람이 쓴 값' }), row('c')]

  it('빈 값이 아닌 필드만 넣고 원문·해시는 그대로 둔다', () => {
    const result = applySuggestionValues(rows, [
      { key: 'a', values: { context: ' 상점 ', ui_type: '', max_len: '12' }, expected: { context: '', ui_type: '', max_len: '' } }
    ], ko)
    expect(result.applied).toEqual(['a'])
    expect(result.rows[0]).toEqual({ ...rows[0], context: '상점', max_len: '12' })
  })

  it('그 사이 바뀐 행·없는 행·잘못된 값·빈 제안은 건너뛴다', () => {
    const result = applySuggestionValues(rows, [
      { key: 'b', values: { context: '제안' }, expected: { context: '' } },
      { key: 'x', values: { context: '제안' }, expected: { context: '' } },
      { key: 'a', values: { max_len: '열둘' }, expected: { max_len: '' } },
      { key: 'c', values: { context: ' ' }, expected: { context: '' } }
    ], ko)
    expect(result.applied).toEqual([])
    expect(result.skipped.map((item) => item.reason)).toEqual(['changed', 'missing', 'invalid', 'empty'])
    expect(result.rows).toEqual(rows)
  })

  it('값 검사: 최대 길이는 양의 정수, vars 는 JSON 배열', () => {
    expect(fieldValueProblem('max_len', '0', ko)).not.toBeNull()
    expect(fieldValueProblem('max_len', '20', ko)).toBeNull()
    expect(fieldValueProblem('vars', '[{"name":"n"}]', ko)).toBeNull()
    expect(fieldValueProblem('vars', '{"name":"n"}', ko)).not.toBeNull()
    expect(fieldValueProblem('context', '아무 글', ko)).toBeNull()
  })
})
