/**
 * 제출 도구(submit_translations·submit_context·submit_terms)가 받은 제출을 판정한 결과.
 * 제출은 "요청"이고, 받을지는 코드가 정한다.
 */
export type SubmitVerdict<T> =
  /** 받는다. remarks 는 받았지만 알릴 것(남은 길이 오류, 버린 항목 등) */
  | { kind: 'accept'; items: T[]; remarks: string | null; remarkCount: number }
  /** 문제를 돌려주고 같은 세션에서 한 번 더 받는다 */
  | { kind: 'retry'; problems: string }
  /** 더 받지 않는다. 아무것도 기록하지 않는다 */
  | { kind: 'reject'; problems: string }

/**
 * 항목마다 따로 받을 수 있는 제출(메타데이터 제안·용어 후보)의 판정.
 * 문제가 없으면 모두 받고, 첫 제출이면 문제를 돌려줘 한 번 고치게 한다. 마지막 제출은 문제없는 항목만 받는다 —
 * 버린 항목은 다음 실행에서 다시 돈다. 받을 항목이 하나도 없는데 requireAny 면 거부한다.
 */
export function settleItems<T>(
  valid: T[],
  issues: readonly string[],
  final: boolean,
  requireAny: boolean
): SubmitVerdict<T> {
  if (issues.length === 0) return { kind: 'accept', items: valid, remarks: null, remarkCount: 0 }
  const problems = issues.join('; ')
  if (!final) return { kind: 'retry', problems }
  if (requireAny && valid.length === 0) return { kind: 'reject', problems }
  return { kind: 'accept', items: valid, remarks: problems, remarkCount: issues.length }
}
