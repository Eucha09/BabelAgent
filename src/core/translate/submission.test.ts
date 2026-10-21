import { describe, expect, it } from 'vitest'
import { checkSubmission, describeProblems, SubmittedTranslation } from './submission'

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
