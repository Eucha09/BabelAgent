import type { StyleRule, StyleRuleChange } from '@shared/schema/project'
import { nextStyleRuleId } from './settings'

/** 규칙 하나의 최대 글자 수. 고정 프롬프트에 매번 들어가므로 길게 두지 않는다. */
export const MAX_RULE_LENGTH = 500

/** 도구 응답에 실을 짧은 코드와 화면에 보여 줄 문장 */
export type RuleChangeProblem = {
  code: 'empty' | 'too-long' | 'duplicate' | 'unknown-id' | 'unchanged'
  message: string
}

export type RuleChangeResult =
  | { ok: true; rules: StyleRule[]; ruleId: string }
  | { ok: false; problem: RuleChangeProblem }

const normalize = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase()

function checkText(text: string, rules: readonly StyleRule[], selfId: string | null): RuleChangeProblem | null {
  const trimmed = text.trim()
  if (trimmed === '') return { code: 'empty', message: '규칙 내용이 비어 있습니다.' }
  if ([...trimmed].length > MAX_RULE_LENGTH) {
    return { code: 'too-long', message: `규칙은 ${MAX_RULE_LENGTH}자 이내로 적어 주세요.` }
  }
  const same = rules.find((rule) => rule.id !== selfId && normalize(rule.text) === normalize(trimmed))
  if (same) return { code: 'duplicate', message: `같은 규칙이 이미 있습니다(${same.id}).` }
  return null
}

/**
 * 스타일 규칙 하나를 추가·수정·삭제한 결과. 순수 함수 — 저장은 호출한 쪽이 한다.
 * 새 규칙 id 는 `r` + 번호로 붙이고, 수정은 id 를 그대로 둔다(프롬프트가 id 순으로 넣는다 — 캐싱).
 */
export function applyStyleRuleChange(
  rules: readonly StyleRule[],
  change: StyleRuleChange,
  now: string
): RuleChangeResult {
  if (change.op === 'add') {
    const problem = checkText(change.text, rules, null)
    if (problem) return { ok: false, problem }
    const id = nextStyleRuleId(rules)
    return { ok: true, rules: [...rules, { id, text: change.text.trim(), createdAt: now }], ruleId: id }
  }

  const index = rules.findIndex((rule) => rule.id === change.id)
  const current = rules[index]
  if (!current) return { ok: false, problem: { code: 'unknown-id', message: `규칙 ${change.id} 이 없습니다.` } }

  if (change.op === 'remove') {
    return { ok: true, rules: rules.filter((rule) => rule.id !== change.id), ruleId: change.id }
  }

  if (current.text.trim() === change.text.trim()) {
    return { ok: false, problem: { code: 'unchanged', message: '바뀐 내용이 없습니다.' } }
  }
  const problem = checkText(change.text, rules, change.id)
  if (problem) return { ok: false, problem }
  const next = [...rules]
  next[index] = { ...current, text: change.text.trim() }
  return { ok: true, rules: next, ruleId: change.id }
}
