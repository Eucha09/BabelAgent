import { describe, expect, it } from 'vitest'
import type { StyleRule } from '@shared/schema/project'
import { applyStyleRuleChange, MAX_RULE_LENGTH } from './rules'

const NOW = '2026-10-22T00:00:00.000Z'
const rules: StyleRule[] = [
  { id: 'r1', text: 'NPC 대사는 반말로', createdAt: '2026-10-20T00:00:00.000Z' },
  { id: 'r3', text: '버튼은 명사형으로', createdAt: '2026-10-21T00:00:00.000Z' }
]

describe('applyStyleRuleChange', () => {
  it('추가하면 가장 큰 번호 다음 id 를 붙이고 앞뒤 공백을 지운다', () => {
    const result = applyStyleRuleChange(rules, { op: 'add', text: '  존댓말은 하십시오체  ' }, NOW)
    expect(result).toEqual({
      ok: true,
      ruleId: 'r4',
      rules: [...rules, { id: 'r4', text: '존댓말은 하십시오체', createdAt: NOW }]
    })
  })

  it('빈 규칙·너무 긴 규칙·이미 있는 규칙은 받지 않는다', () => {
    const problem = (text: string): string | null => {
      const result = applyStyleRuleChange(rules, { op: 'add', text }, NOW)
      return result.ok ? null : result.problem.code
    }
    expect(problem('   ')).toBe('empty')
    expect(problem('가'.repeat(MAX_RULE_LENGTH + 1))).toBe('too-long')
    expect(problem('npc  대사는 반말로')).toBe('duplicate')
  })

  it('수정은 id 와 만든 시각을 그대로 둔다', () => {
    const result = applyStyleRuleChange(rules, { op: 'update', id: 'r1', text: 'NPC 대사는 존댓말로' }, NOW)
    expect(result.ok && result.rules[0]).toEqual({ id: 'r1', text: 'NPC 대사는 존댓말로', createdAt: '2026-10-20T00:00:00.000Z' })
  })

  it('없는 id, 바뀌지 않은 수정, 다른 규칙과 같아지는 수정은 거부한다', () => {
    const code = (result: ReturnType<typeof applyStyleRuleChange>): string | null => (result.ok ? null : result.problem.code)
    expect(code(applyStyleRuleChange(rules, { op: 'update', id: 'r9', text: 'x' }, NOW))).toBe('unknown-id')
    expect(code(applyStyleRuleChange(rules, { op: 'update', id: 'r1', text: ' NPC 대사는 반말로 ' }, NOW))).toBe('unchanged')
    expect(code(applyStyleRuleChange(rules, { op: 'update', id: 'r1', text: '버튼은 명사형으로' }, NOW))).toBe('duplicate')
    expect(code(applyStyleRuleChange(rules, { op: 'remove', id: 'r2' }, NOW))).toBe('unknown-id')
  })

  it('삭제', () => {
    const result = applyStyleRuleChange(rules, { op: 'remove', id: 'r1' }, NOW)
    expect(result.ok && result.rules.map((rule) => rule.id)).toEqual(['r3'])
  })
})
