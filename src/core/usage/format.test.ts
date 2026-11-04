import { describe, expect, it } from 'vitest'
import { en } from '@shared/i18n/en'
import { ko } from '@shared/i18n/ko'
import { formatRemaining, remainingPercent, usageLabel } from './format'

const NOW = Date.parse('2026-10-19T06:00:00.000Z')

describe('usageLabel', () => {
  it.each([
    ['session', '5시간'],
    ['weekly_all', '주간']
  ])('알려진 kind는 한국어 이름: %s', (kind, expected) => {
    expect(usageLabel(kind, null, ko)).toBe(expected)
  })

  it('범위가 있는 주간 한도는 모델 이름을 붙인다', () => {
    expect(usageLabel('weekly_scoped', { model: { display_name: 'Opus' } }, ko)).toBe('주간 · Opus')
  })

  it('범위 정보가 없으면 일반 이름', () => {
    expect(usageLabel('weekly_scoped', null, ko)).toBe('주간(범위)')
  })

  it('모르는 kind는 서버 값을 그대로 보여준다', () => {
    expect(usageLabel('monthly_overage', null, ko)).toBe('monthly_overage')
    expect(usageLabel('monthly_overage', { surface: { display_name: '웹' } }, ko)).toBe(
      'monthly_overage · 웹'
    )
  })
})

describe('remainingPercent', () => {
  it.each([
    [21, 79],
    [0, 100],
    [100, 0],
    [10.4, 90],
    [-5, 100],
    [130, 0]
  ])('사용률 %s%% → 남음 %s%%', (used, expected) => {
    expect(remainingPercent(used)).toBe(expected)
  })

  it('숫자가 아니면 0으로 본다', () => {
    expect(remainingPercent(Number.NaN)).toBe(0)
  })
})

describe('formatRemaining', () => {
  it('하루가 넘으면 일과 시간만 쓴다', () => {
    expect(formatRemaining('2026-10-24T02:59:59.000Z', NOW, ko)).toBe('4일 20시간 뒤')
  })

  it('하루 미만은 시간과 분', () => {
    expect(formatRemaining('2026-10-19T10:54:00.000Z', NOW, ko)).toBe('4시간 54분 뒤')
  })

  it('한 시간 미만은 분만', () => {
    expect(formatRemaining('2026-10-19T06:42:00.000Z', NOW, ko)).toBe('42분 뒤')
  })

  it('1분 미만은 따로 표기한다', () => {
    expect(formatRemaining('2026-10-19T06:00:30.000Z', NOW, ko)).toBe('1분 이내')
  })

  it('이미 지난 시각은 곧 초기화', () => {
    expect(formatRemaining('2026-10-19T05:00:00.000Z', NOW, ko)).toBe('곧 초기화')
  })

  it.each([null, 'not-a-date'])('시각을 못 읽으면 안내 문구: %s', (input) => {
    expect(formatRemaining(input, NOW, ko)).toBe('초기화 시각 없음')
  })

  it('화면 언어의 카탈로그로 문장을 만든다', () => {
    expect(formatRemaining('2026-10-24T02:59:59.000Z', NOW, en)).toBe('in 4d 20h')
    expect(formatRemaining('2026-10-19T10:54:00.000Z', NOW, en)).toBe('in 4h 54m')
    expect(formatRemaining(null, NOW, en)).toBe('No reset time')
    expect(usageLabel('weekly_scoped', { model: { display_name: 'Opus' } }, en)).toBe('Weekly · Opus')
  })
})
