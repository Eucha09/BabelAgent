/**
 * 원문 행 순서 조작. 키가 행의 정체이므로 위치가 아니라 키로 행을 찾는다.
 * 모두 새 배열을 돌려주고 입력은 건드리지 않는다.
 */
type Keyed = { key: string }

export type DropPosition = 'before' | 'after'

/** 한 칸 위(-1) 또는 아래(+1)로 옮긴다. 끝에 닿았으면 그대로 돌려준다. */
export function moveByOffset<T extends Keyed>(rows: readonly T[], key: string, offset: -1 | 1): T[] {
  const from = rows.findIndex((row) => row.key === key)
  const to = from + offset
  if (from < 0 || to < 0 || to >= rows.length) return [...rows]

  const next = [...rows]
  const [moved] = next.splice(from, 1)
  if (moved) next.splice(to, 0, moved)
  return next
}

/** 대상 행의 앞이나 뒤로 옮긴다. 끌어서 놓기에서 쓴다. */
export function moveRelative<T extends Keyed>(
  rows: readonly T[],
  key: string,
  targetKey: string,
  position: DropPosition
): T[] {
  if (key === targetKey) return [...rows]
  const moving = rows.find((row) => row.key === key)
  if (!moving || !rows.some((row) => row.key === targetKey)) return [...rows]

  const rest = rows.filter((row) => row.key !== key)
  const targetIndex = rest.findIndex((row) => row.key === targetKey)
  rest.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, moving)
  return rest
}

/** 기준 행 바로 아래에 넣는다. 기준이 없거나 찾지 못하면 맨 끝에 붙인다. */
export function insertAfter<T extends Keyed>(rows: readonly T[], row: T, afterKey: string | null): T[] {
  const index = afterKey === null ? -1 : rows.findIndex((item) => item.key === afterKey)
  if (index < 0) return [...rows, row]
  const next = [...rows]
  next.splice(index + 1, 0, row)
  return next
}
