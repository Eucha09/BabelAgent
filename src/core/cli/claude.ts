import type { ClaudeExecutable, ClaudeUpdateOutcome } from '@shared/schema/cli'

/** `claude --version` 출력(`2.1.303 (Claude Code)`)에서 버전 숫자만 뽑는다. 없으면 null */
export function parseClaudeVersion(output: string): string | null {
  return /(\d+)\.(\d+)\.(\d+)/.exec(output)?.[0] ?? null
}

/** 점으로 나눈 숫자 버전 비교. a < b 면 음수, 같으면 0, 크면 양수 */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 버전이 요구 버전 이상인지. 둘 중 하나라도 모르면 null */
export function meetsVersion(version: string | null, required: string | null): boolean | null {
  if (version === null || required === null) return null
  return compareVersions(version, required) >= 0
}

/**
 * 쓸 실행 파일을 고른다. 후보 순서: 설정 → 공식 설치 → PATH → SDK 내장.
 * 설정한 경로는 파일이 없어도 그대로 돌려준다 — 조용히 다른 실행 파일로 바꾸면 사용자가 원인을 모른다.
 */
export function pickClaudeExecutable(
  candidates: readonly ClaudeExecutable[],
  exists: (path: string) => boolean
): ClaudeExecutable | null {
  for (const candidate of candidates) {
    if (candidate.source === 'setting' || exists(candidate.path)) return candidate
  }
  return null
}

/** 업데이트 결과를 앞뒤 버전과 종료 코드로 정한다. 출력 문장은 언어·버전마다 달라 보지 않는다 */
export function updateOutcome(before: string | null, after: string | null, exitCode: number | null): ClaudeUpdateOutcome {
  if (exitCode !== 0 || after === null) return 'failed'
  if (before !== null && compareVersions(after, before) > 0) return 'updated'
  return 'current'
}
