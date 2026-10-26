import { z } from 'zod'
import type { ContextSuggestion } from '@shared/schema/context'
import type { VarMeta } from '@shared/schema/strings'
import { settleItems, type SubmitVerdict } from '../submit'
import { measureDisplayLength } from '../qa/length'
import type { SmartStringsSettings } from '../qa/smart'
import { examplesByName, normalizeName, parseVarsMeta } from '../qa/vars'
import type { ContextTarget } from './targets'

export const SubmittedVar = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  meaning: z.string(),
  example: z.string().optional()
})

/** 에이전트가 submit_context 로 내는 한 행. MCP 도구의 입력 스키마로도 쓴다. */
export const SubmittedContext = z.object({
  key: z.string().min(1),
  context: z.string().optional(),
  ui_type: z.string().optional(),
  max_len: z.number().int().min(1).optional(),
  vars: z.array(SubmittedVar).optional(),
  confidence: z.number().min(0).max(1),
  note: z.string().optional()
})
export type SubmittedContext = z.infer<typeof SubmittedContext>

/** 도구 입력 모양(zod raw shape) */
export const CONTEXT_INPUT_SHAPE = { entries: z.array(SubmittedContext) }

/** 한 항목의 문제. 에이전트에게 돌려줄 짧은 영어다. */
function entryIssues(entry: SubmittedContext, target: ContextTarget, caseSensitive: boolean): string[] {
  const issues: string[] = []
  const { key } = target.row
  if (target.fill.includes('context') && (entry.context ?? '').trim() === '') issues.push(`${key}: context is missing`)
  if (target.fill.includes('ui_type') && (entry.ui_type ?? '').trim() === '') issues.push(`${key}: ui_type is missing`)
  if (target.fill.includes('vars')) {
    if (!entry.vars) {
      issues.push(`${key}: vars is missing`)
    } else {
      const expected = new Set(target.variables.map((name) => normalizeName(name, caseSensitive)))
      const names = entry.vars.map((item) => normalizeName(item.name, caseSensitive))
      const same = names.length === expected.size && new Set(names).size === names.length && names.every((name) => expected.has(name))
      if (!same) {
        issues.push(`${key}: vars must describe exactly these names: ${target.variables.join(', ')} (got: ${entry.vars.map((item) => item.name).join(', ') || 'none'})`)
      }
    }
  }
  return issues
}

/**
 * 메타데이터 제출을 판정한다. 키는 배치와 맞아야 하고(빠짐·남음·겹침), 요청한 필드가 있어야 하며,
 * vars 의 이름은 원문에서 뽑은 집합과 같아야 한다. max_len 은 내지 않아도 된다(제한이 분명할 때만 낸다).
 * 문제 있는 항목은 첫 제출이면 돌려줘 고치게 하고, 마지막 제출이면 버리고 나머지만 받는다.
 */
export function judgeContext(input: {
  targets: readonly ContextTarget[]
  entries: readonly SubmittedContext[]
  final: boolean
  caseSensitive: boolean
}): SubmitVerdict<SubmittedContext> {
  const byKey = new Map(input.targets.map((target) => [target.row.key, target]))
  const seen = new Set<string>()
  const issues: string[] = []
  const valid: SubmittedContext[] = []

  for (const entry of input.entries) {
    const target = byKey.get(entry.key)
    if (!target) {
      issues.push(`unknown key: ${entry.key}`)
      continue
    }
    if (seen.has(entry.key)) {
      issues.push(`duplicate key: ${entry.key}`)
      continue
    }
    seen.add(entry.key)
    const problems = entryIssues(entry, target, input.caseSensitive)
    if (problems.length > 0) issues.push(...problems)
    else valid.push(entry)
  }
  for (const target of input.targets) {
    if (!seen.has(target.row.key)) issues.push(`missing key: ${target.row.key}`)
  }
  return settleItems(valid, issues, input.final, input.targets.length > 0)
}

/** 제안하는 max_len 의 하한. 짧은 원문(버튼 두 글자 등)도 번역이 들어갈 자리를 남긴다. */
export const MIN_SUGGESTED_MAX_LEN = 10

/**
 * 넉넉한 max_len 하한: 원문 표시 길이 × 배수, 최소 MIN_SUGGESTED_MAX_LEN.
 * max_len 은 번역문의 한도인데 에이전트는 원문 길이에 맞춰 빡빡하게 잡기 쉽다. 배수는 project.json 의
 * context.maxLenRatio — 언어 조합마다 알맞은 값이 달라 코드에 박지 않는다.
 */
export function generousMaxLen(sourceLength: number, ratio: number): number {
  return Math.max(MIN_SUGGESTED_MAX_LEN, Math.ceil(sourceLength * ratio))
}

/** 제안 행을 만들 때 쓰는 프로젝트 설정 */
export type SuggestionRules = {
  smart: SmartStringsSettings
  maxLenRatio: number
}

/**
 * 받은 항목을 제안 행으로 바꾼다. 요청한 필드만 담는다 — 이미 값이 있는 칸을 제안으로 덮지 않게.
 * vars 는 원문 표기의 이름 순서로 JSON 배열을 만든다. max_len 은 generousMaxLen 아래면 그 값으로 올린다
 * (원문 길이는 QA 와 같은 방식으로 세고, 변수는 제안된 example — 없으면 기존 vars 의 example 로 바꿔 센다).
 * 담을 값이 하나도 없으면 null.
 */
export function toSuggestion(entry: SubmittedContext, target: ContextTarget, rules: SuggestionRules): ContextSuggestion | null {
  const { caseSensitive } = rules.smart
  const wants = (field: ContextTarget['fill'][number]): boolean => target.fill.includes(field)
  let suggestedVars: VarMeta[] = []
  if (wants('vars') && entry.vars) {
    const byName = new Map(entry.vars.map((item) => [normalizeName(item.name, caseSensitive), item]))
    suggestedVars = target.variables.flatMap((name) => {
      const item = byName.get(normalizeName(name, caseSensitive))
      if (!item) return []
      const meta: VarMeta = { name }
      if (item.type?.trim()) meta.type = item.type.trim()
      if (item.meaning.trim()) meta.meaning = item.meaning.trim()
      if (item.example?.trim()) meta.example = item.example.trim()
      return [meta]
    })
  }
  const vars = suggestedVars.length > 0 ? JSON.stringify(suggestedVars) : ''

  let maxLen = ''
  if (wants('max_len') && entry.max_len !== undefined) {
    // 뒤에 오는 제안 example 이 기존 vars 의 example 을 덮는다
    const existing = parseVarsMeta(target.row.vars)
    const examples = examplesByName([...(existing.ok ? existing.items : []), ...suggestedVars], caseSensitive)
    const sourceLength = measureDisplayLength(target.row.source, rules.smart, examples, caseSensitive).length
    maxLen = String(Math.max(entry.max_len, generousMaxLen(sourceLength, rules.maxLenRatio)))
  }
  const suggestion: ContextSuggestion = {
    key: target.row.key,
    source_hash: target.row.source_hash,
    context: wants('context') ? (entry.context ?? '').trim() : '',
    ui_type: wants('ui_type') ? (entry.ui_type ?? '').trim() : '',
    max_len: maxLen,
    vars,
    confidence: String(Math.round(entry.confidence * 100) / 100),
    note: (entry.note ?? '').trim()
  }
  const proposed = suggestion.context || suggestion.ui_type || suggestion.max_len || suggestion.vars
  return proposed ? suggestion : null
}
