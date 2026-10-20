/** 서버가 내려주는 한도 행. 새 미터가 생겨도 클라이언트 수정 없이 렌더링한다. */
export type UsageScope = {
  model?: { display_name: string } | null
  surface?: { display_name: string } | null
}

/**
 * 한도 종류를 한국어 이름으로 바꾼다.
 * 모르는 kind는 서버 값을 그대로 보여준다 — 새 미터를 숨기지 않기 위해서다.
 */
export function usageLabel(kind: string, scope?: UsageScope | null): string {
  const scoped = scope?.model?.display_name ?? scope?.surface?.display_name ?? null
  switch (kind) {
    case 'session':
      return '5시간'
    case 'weekly_all':
      return '주간'
    case 'weekly_scoped':
      return scoped ? `주간 · ${scoped}` : '주간(범위)'
    default:
      return scoped ? `${kind} · ${scoped}` : kind
  }
}

/** 사용률(0~100)을 남은 비율로 바꾼다. 서버가 범위를 벗어난 값을 줘도 0~100으로 자른다. */
export function remainingPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  return Math.max(0, Math.min(100, Math.round(100 - percent)))
}

/**
 * 초기화까지 남은 시간을 사람이 읽는 문장으로 바꾼다.
 * 하루가 넘으면 분은 버린다 — "4일 18시간 뒤"처럼 큰 단위 두 개면 충분하다.
 */
export function formatRemaining(resetsAt: string | null, now: number): string {
  if (!resetsAt) return '초기화 시각 없음'
  const target = Date.parse(resetsAt)
  if (Number.isNaN(target)) return '초기화 시각 없음'

  const diffMs = target - now
  if (diffMs <= 0) return '곧 초기화'

  const totalMinutes = Math.floor(diffMs / 60_000)
  const days = Math.floor(totalMinutes / 1_440)
  const hours = Math.floor((totalMinutes % 1_440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}일 ${hours}시간 뒤`
  if (hours > 0) return `${hours}시간 ${minutes}분 뒤`
  if (minutes > 0) return `${minutes}분 뒤`
  return '1분 이내'
}
