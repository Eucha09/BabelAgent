/** 새 키를 쓸 수 없는 이유. 화면에서 문장으로 바꿔 보여준다. */
export type KeyProblem = 'empty' | 'duplicate' | 'newline'

/**
 * 새로 추가할 키를 검사한다. 앞뒤 공백은 호출 전에 잘라서 넘긴다.
 * 키는 번역·내보내기의 기준이라 비거나 겹치면 안 된다.
 */
export function validateNewKey(key: string, existing: ReadonlySet<string>): KeyProblem | null {
  if (key === '') return 'empty'
  if (key.includes('\n') || key.includes('\r')) return 'newline'
  if (existing.has(key)) return 'duplicate'
  return null
}

/** 지울 키인데 저장할 원문에 아직 남아 있는 것. 요청이 앞뒤가 맞지 않으면 저장하지 않는다. */
export function findDeletedStillPresent(
  rowKeys: readonly string[],
  deletedKeys: readonly string[]
): string[] {
  const present = new Set(rowKeys)
  return deletedKeys.filter((key) => present.has(key))
}

export type KeyProblems = {
  emptyCount: number
  duplicates: string[]
}

/** 저장 직전 전체 키 검사. 렌더러를 거치지 않은 요청도 막기 위해 메인에서 다시 본다. */
export function findKeyProblems(keys: readonly string[]): KeyProblems {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  let emptyCount = 0
  for (const key of keys) {
    if (key.trim() === '') {
      emptyCount += 1
      continue
    }
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  }
  return { emptyCount, duplicates: [...duplicates] }
}
