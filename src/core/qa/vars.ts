import { VarsColumn, type VarMeta } from '@shared/schema/strings'
import { walkPlaceholders, type SmartToken } from './smart'

/**
 * 변수 이름(선택자)을 모든 중첩 단계에서 등장 순으로 모은다. 중복은 뺀다.
 * 빈 플레이스홀더 `{}` 는 이름이 없어 대조할 대상이 없으므로 넣지 않는다.
 */
export function extractVariables(tokens: readonly SmartToken[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const placeholder of walkPlaceholders(tokens)) {
    if (placeholder.selector === '' || seen.has(placeholder.selector)) continue
    seen.add(placeholder.selector)
    names.push(placeholder.selector)
  }
  return names
}

export function normalizeName(name: string, caseSensitive: boolean): string {
  return caseSensitive ? name : name.toLowerCase()
}

export type VariableDiff = {
  /** 원문에 있는데 번역문에 없는 변수(원문 표기) */
  missing: string[]
  /** 번역문에 있는데 원문에 없는 변수(번역문 표기) */
  extra: string[]
}

/** 집합 비교. 순서와 등장 횟수는 보지 않는다. */
export function compareVariables(
  source: readonly string[],
  translation: readonly string[],
  caseSensitive: boolean
): VariableDiff {
  const sourceSet = new Set(source.map((name) => normalizeName(name, caseSensitive)))
  const translationSet = new Set(translation.map((name) => normalizeName(name, caseSensitive)))
  return {
    missing: source.filter((name) => !translationSet.has(normalizeName(name, caseSensitive))),
    extra: translation.filter((name) => !sourceSet.has(normalizeName(name, caseSensitive)))
  }
}

export type VarsMetaParse =
  | { ok: true; items: VarMeta[] }
  /** 읽지 못하면 빈 배열로 취급하고 경고한다. */
  | { ok: false; reason: string }

/** vars 열을 읽는다. 빈 칸은 "메타데이터 없음"이다. */
export function parseVarsMeta(raw: string): VarsMetaParse {
  if (raw.trim() === '') return { ok: true, items: [] }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
  const parsed = VarsColumn.safeParse(json)
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')
    }
  }
  return { ok: true, items: parsed.data }
}

/** 변수 이름 → example. 이름 비교는 caseSensitive 를 따른다. */
export function examplesByName(items: readonly VarMeta[], caseSensitive: boolean): Map<string, string> {
  const map = new Map<string, string>()
  for (const item of items) {
    if (item.example !== undefined) map.set(normalizeName(item.name, caseSensitive), item.example)
  }
  return map
}
