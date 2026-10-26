import { CONTEXT_FIELDS, type ContextField, type ContextScope } from '@shared/schema/context'
import type { MasterRow } from '@shared/schema/strings'
import { parseSmart, type SmartSyntax } from '../qa/smart'
import { extractVariables } from '../qa/vars'

/** 컨텍스트 추정 한 행: 채울 필드와, 원문에서 코드로 뽑은 변수 이름 */
export type ContextTarget = {
  row: MasterRow
  fill: ContextField[]
  variables: string[]
}

/** 원문의 변수 이름. vars 메타데이터의 기준이다 — 에이전트가 이름을 짓지 않게 코드가 뽑아서 준다. */
export function sourceVariables(source: string, syntax: SmartSyntax): string[] {
  return extractVariables(parseSmart(source, syntax).tokens)
}

/**
 * 이 행에서 에이전트가 채울 필드. 고른 필드 중 빈 칸만 채운다 — 사람이 쓴 값은 덮지 않는다.
 * 변수가 없는 원문에는 vars 를 묻지 않는다.
 */
export function fillFor(row: MasterRow, fields: readonly ContextField[], variables: readonly string[]): ContextField[] {
  return CONTEXT_FIELDS.filter(
    (field) => fields.includes(field) && row[field].trim() === '' && (field !== 'vars' || variables.length > 0)
  )
}

export type ContextTargets = {
  targets: ContextTarget[]
  /** 채울 칸이 있지만 이미 승인을 기다리는 제안이 있어 뺀 키 */
  skippedPending: string[]
}

/**
 * 추정할 행을 원문 순서대로 고른다. 승인을 기다리는 제안이 있는 행은 다시 돌리지 않는다 —
 * 그래서 다시 실행하면 남은 행부터 이어서 처리된다.
 */
export function selectContextTargets(
  rows: readonly MasterRow[],
  input: { fields: readonly ContextField[]; scope: ContextScope; selected: ReadonlySet<string> },
  pendingKeys: ReadonlySet<string>,
  syntax: SmartSyntax
): ContextTargets {
  const targets: ContextTarget[] = []
  const skippedPending: string[] = []
  for (const row of rows) {
    if (input.scope === 'selected' && !input.selected.has(row.key)) continue
    const variables = sourceVariables(row.source, syntax)
    const fill = fillFor(row, input.fields, variables)
    if (fill.length === 0) continue
    if (pendingKeys.has(row.key)) {
      skippedPending.push(row.key)
      continue
    }
    targets.push({ row, fill, variables })
  }
  return { targets, skippedPending }
}

/** 프로젝트에서 이미 쓰는 ui_type 값. 에이전트가 같은 표기를 쓰도록 프롬프트에 준다. */
export function knownUiTypes(rows: readonly MasterRow[]): string[] {
  return [...new Set(rows.map((row) => row.ui_type.trim()).filter((value) => value !== ''))].sort()
}
