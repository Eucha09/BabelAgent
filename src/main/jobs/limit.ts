/** 재설정 시각을 모를 때의 대기 단계(밀리초): 1 → 2 → 5 → 10분. */
export const BACKOFF_MS: readonly number[] = [60_000, 120_000, 300_000, 600_000]

/** 재설정 시각이 코앞이어도 이만큼은 기다린다. 같은 오류로 곧바로 되튀지 않게. */
export const MIN_LIMIT_WAIT_MS = 5_000

/** SDK가 주는 재설정 시각을 밀리초 epoch로 맞춘다. 단위가 문서에 없어 초·밀리초 둘 다 받는다. */
export function normalizeResetsAt(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null
  return value < 1e12 ? value * 1000 : value
}

/**
 * attempt번째(1부터) 한도 오류 뒤 기다릴 시간. null이면 자동 재시도를 멈추고 사용자를 기다린다.
 * 재설정 시각을 알면 그때까지 기다리되, 단계 수는 똑같이 센다 — 같은 시각이 계속 와도 끝없이 돌지 않게.
 */
export function limitDelay(attempt: number, resetsAt: number | null, now: number): number | null {
  if (attempt < 1 || attempt > BACKOFF_MS.length) return null
  if (resetsAt !== null && resetsAt > now) return Math.max(resetsAt - now, MIN_LIMIT_WAIT_MS)
  return BACKOFF_MS[attempt - 1] ?? null
}

/** 오류 문장이 사용량 한도를 뜻하는지. SDK가 구조화된 신호를 주지 않는 경로(던져진 예외 등)에서 쓴다. */
export function isLimitText(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('rate_limit') ||
    lower.includes('rate limit') ||
    lower.includes('usage limit') ||
    lower.includes('limit reached') ||
    lower.includes('too many requests') ||
    lower.includes(' 429')
  )
}
