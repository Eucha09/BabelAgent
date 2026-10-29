import type { MasterRow } from '@shared/schema/strings'
import { parseSmart, type SmartSyntax } from '../qa/smart'

/** smart 칸의 뜻. `true`/`false`(대소문자·앞뒤 공백 무시), 그 밖은 미정(null). */
export function parseSmartFlag(raw: string): boolean | null {
  const value = raw.trim().toLowerCase()
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

/** 앱이 smart 칸을 정할 때 쓰는 글자 */
export function formatSmartFlag(value: boolean): string {
  return value ? 'true' : 'false'
}

/**
 * 원문에 Smart 구문(닫힌 플레이스홀더)이 있는지. 이스케이프된 중괄호(`{{`)는 글자라 세지 않고,
 * 닫히지 않은 `{` 는 구문이 아니라 오류로 본다.
 */
export function hasSmartSyntax(source: string, syntax: SmartSyntax): boolean {
  return parseSmart(source, syntax).tokens.some((token) => token.kind === 'placeholder' && token.closed)
}

/** smart 를 true 로 제안할 행: 칸이 미정이고 원문에 Smart 구문이 있다. 사용자가 false 로 둔 행은 뺀다. */
export function needsSmartSuggestion(row: Pick<MasterRow, 'source' | 'smart'>, syntax: SmartSyntax): boolean {
  return parseSmartFlag(row.smart) === null && hasSmartSyntax(row.source, syntax)
}
