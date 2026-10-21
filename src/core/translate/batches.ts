import type { MasterRow } from '@shared/schema/strings'

export type BatchLimits = { maxRows: number; maxSourceChars: number }

export type TranslateBatch = {
  /** 작업 안에서의 순번(1부터). 로그와 화면 표시용. */
  id: number
  rows: MasterRow[]
}

/** 동시 실행 상한. 설정값이 이보다 커도 잘라낸다. */
export const MAX_CONCURRENCY = 3

export function clampConcurrency(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(MAX_CONCURRENCY, Math.floor(value)))
}

/**
 * 행을 배치로 나눈다. 행 수 또는 원문 누적 길이 중 먼저 걸리는 쪽에서 끊는다.
 * 한 행이 혼자 글자 수 한도를 넘으면 그 행만으로 배치를 만든다.
 * 입력 순서를 그대로 따른다 — 원문 순서가 곧 사용자가 정한 맥락 순서다.
 */
export function buildBatches(rows: readonly MasterRow[], limits: BatchLimits): TranslateBatch[] {
  const maxRows = Math.max(1, Math.floor(limits.maxRows))
  const maxChars = Math.max(1, Math.floor(limits.maxSourceChars))
  const batches: TranslateBatch[] = []
  let current: MasterRow[] = []
  let chars = 0

  const flush = (): void => {
    if (current.length === 0) return
    batches.push({ id: batches.length + 1, rows: current })
    current = []
    chars = 0
  }

  for (const row of rows) {
    const length = row.source.length
    // 넣으면 한도를 넘는다면 지금까지를 먼저 닫는다
    if (current.length > 0 && chars + length > maxChars) flush()
    current.push(row)
    chars += length
    if (current.length >= maxRows || chars >= maxChars) flush()
  }
  flush()
  return batches
}
