import { describe, expect, it } from 'vitest'
import type { QaDiagnostic, QaRuleId } from '@shared/schema/qa'
import { checkSubmission, describeProblems, judgeSubmission, SubmittedTranslation } from './submission'

const item = (key: string, text = 'x') => ({ key, text })

describe('checkSubmission', () => {
  it('키가 정확히 맞으면 통과', () => {
    expect(checkSubmission(['a', 'b'], [item('b'), item('a')])).toEqual({ ok: true })
  })

  it('빠진 키', () => {
    const result = checkSubmission(['a', 'b'], [item('a')])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.missing).toEqual(['b'])
  })

  it('배치에 없는 키', () => {
    const result = checkSubmission(['a'], [item('a'), item('z')])
    if (result.ok) throw new Error('통과하면 안 된다')
    expect(result.problems.extra).toEqual(['z'])
  })

  it('중복 키', () => {
    const result = checkSubmission(['a'], [item('a'), item('a')])
    if (result.ok) throw new Error('통과하면 안 된다')
    expect(result.problems.duplicates).toEqual(['a'])
  })

  it('빈 번역문', () => {
    const result = checkSubmission(['a', 'b'], [item('a', '  '), item('b')])
    if (result.ok) throw new Error('통과하면 안 된다')
    expect(result.problems.empty).toEqual(['a'])
  })

  it('문제를 짧은 문장으로', () => {
    const text = describeProblems({ missing: ['a'], extra: ['z'], duplicates: [], empty: ['b'] })
    expect(text).toBe('missing keys: a; unknown keys: z; empty text: b')
  })
})

describe('SubmittedTranslation 스키마', () => {
  it('confidence 는 0~1', () => {
    expect(SubmittedTranslation.safeParse({ key: 'a', text: 'x', confidence: 1.2 }).success).toBe(false)
    expect(SubmittedTranslation.safeParse({ key: 'a', text: 'x', confidence: 0.5 }).success).toBe(true)
  })

  it('빈 키는 거부', () => {
    expect(SubmittedTranslation.safeParse({ key: '', text: 'x', confidence: 0.5 }).success).toBe(false)
  })
})

describe('judgeSubmission', () => {
  const diag = (ruleId: QaRuleId, severity: 'error' | 'warning' = 'error', items: string[] = []): QaDiagnostic => ({
    ruleId,
    severity,
    key: '',
    message: '',
    items
  })
  const items = [
    { key: 'a', text: 'A', confidence: 0.9 },
    { key: 'b', text: 'B', confidence: 0.9 }
  ]
  const judge = (final: boolean, mode: 'batch' | 'candidate', qa: Record<string, QaDiagnostic[]>) =>
    judgeSubmission({ expectedKeys: ['a', 'b'], items, final, mode, qa: (item) => qa[item.key] ?? [] })

  it('문제가 없으면 받는다', () => {
    expect(judge(false, 'batch', {})).toEqual({ kind: 'accept', unresolved: [] })
  })

  it('경고는 막지 않는다', () => {
    expect(judge(false, 'batch', { a: [diag('glossary.violation', 'warning')] }).kind).toBe('accept')
  })

  it('첫 제출에서는 모든 오류를 돌려준다', () => {
    const verdict = judge(false, 'batch', { a: [diag('var.missing', 'error', ['name'])], b: [diag('len.over_max', 'error', ['23/20'])] })
    expect(verdict).toEqual({ kind: 'retry', problems: 'a: var.missing (name); b: len.over_max (23/20)' })
  })

  it('마지막 제출에 구조 오류가 남으면 배치를 거부한다', () => {
    const verdict = judge(true, 'batch', { a: [diag('tag.unclosed', 'error', ['b'])], b: [diag('len.over_max')] })
    expect(verdict).toEqual({ kind: 'reject', problems: 'a: tag.unclosed (b)' })
  })

  it('마지막 제출에 길이·strict 용어 오류만 남으면 기록한다', () => {
    const verdict = judge(true, 'batch', { b: [diag('len.over_max'), diag('glossary.violation_strict')] })
    expect(verdict.kind).toBe('accept')
    if (verdict.kind === 'accept') expect(verdict.unresolved.map((issue) => issue.ruleId)).toEqual(['len.over_max', 'glossary.violation_strict'])
  })

  it('후보 모드는 마지막에 구조 오류가 남아도 받는다', () => {
    expect(judge(true, 'candidate', { a: [diag('var.extra')] }).kind).toBe('accept')
  })

  it('키 문제는 QA 보다 먼저, 마지막이면 거부', () => {
    const verdict = judgeSubmission({ expectedKeys: ['a', 'b', 'c'], items, final: true, mode: 'candidate', qa: () => [] })
    expect(verdict).toEqual({ kind: 'reject', problems: 'missing keys: c' })
  })
})
