import { describe, expect, it } from 'vitest'
import { BACKOFF_MS, isLimitText, limitDelay, MIN_LIMIT_WAIT_MS, normalizeResetsAt } from './limit'

const NOW = 1_800_000_000_000

describe('normalizeResetsAt', () => {
  it('초 단위면 밀리초로', () => {
    expect(normalizeResetsAt(1_800_000_000)).toBe(1_800_000_000_000)
  })

  it('밀리초면 그대로', () => {
    expect(normalizeResetsAt(1_800_000_000_123)).toBe(1_800_000_000_123)
  })

  it.each([undefined, null, 0, -5, Number.NaN])('쓸 수 없는 값은 null: %s', (value) => {
    expect(normalizeResetsAt(value)).toBeNull()
  })
})

describe('limitDelay', () => {
  it('재설정 시각을 모르면 1 → 2 → 5 → 10분', () => {
    expect([1, 2, 3, 4].map((attempt) => limitDelay(attempt, null, NOW))).toEqual([...BACKOFF_MS])
  })

  it('단계를 다 쓰면 null (사용자 조작 대기)', () => {
    expect(limitDelay(5, null, NOW)).toBeNull()
  })

  it('재설정 시각을 알면 그때까지', () => {
    expect(limitDelay(1, NOW + 90_000, NOW)).toBe(90_000)
  })

  it('재설정 시각이 코앞이어도 최소 대기', () => {
    expect(limitDelay(1, NOW + 1_000, NOW)).toBe(MIN_LIMIT_WAIT_MS)
  })

  it('이미 지난 재설정 시각은 무시하고 백오프', () => {
    expect(limitDelay(2, NOW - 1_000, NOW)).toBe(BACKOFF_MS[1])
  })

  it('재설정 시각을 알아도 단계를 다 쓰면 null', () => {
    expect(limitDelay(5, NOW + 90_000, NOW)).toBeNull()
  })
})

describe('isLimitText', () => {
  it.each([
    'rate_limit',
    'Rate limit exceeded',
    "Claude AI usage limit reached",
    'HTTP 429 Too Many Requests'
  ])('한도: %s', (text) => {
    expect(isLimitText(text)).toBe(true)
  })

  it.each(['authentication_failed', 'overloaded', 'invalid key'])('한도 아님: %s', (text) => {
    expect(isLimitText(text)).toBe(false)
  })
})
