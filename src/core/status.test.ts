import { describe, expect, it } from 'vitest'
import type { TranslationRow } from '@shared/schema/strings'
import { applyManualUpdate } from './status'
import { ko } from '@shared/i18n/ko'

const master = { source: '새 원문', source_hash: 'new' }

function previous(partial: Partial<TranslationRow> = {}): TranslationRow {
  return {
    key: 'k',
    text: 'Old text',
    source_hash: 'old',
    status: 'draft',
    confidence: '0.6',
    note: '메모',
    source_snapshot: '옛 원문',
    ...partial
  }
}

describe('applyManualUpdate', () => {
  it('글을 고치면 지금 원문의 해시·원문을 달고 신뢰도를 비운다', () => {
    const result = applyManualUpdate('k', previous(), { text: 'New text', status: 'draft' }, master, ko)
    expect(result).toEqual({
      ok: true,
      row: {
        key: 'k',
        text: 'New text',
        status: 'draft',
        source_hash: 'new',
        source_snapshot: '새 원문',
        confidence: '',
        note: '메모'
      }
    })
  })

  it('번역 파일에 없던 행도 만든다', () => {
    const result = applyManualUpdate('k', undefined, { text: 'Hi', status: 'draft' }, master, ko)
    expect(result.ok && result.row).toMatchObject({ text: 'Hi', status: 'draft', source_hash: 'new', note: '' })
  })

  it('stale 행을 글 그대로 승인하면 새 원문에 맞다고 확인한 것이다', () => {
    const result = applyManualUpdate('k', previous({ status: 'stale' }), { text: 'Old text', status: 'approved' }, master, ko)
    expect(result.ok && result.row).toMatchObject({ status: 'approved', source_hash: 'new', source_snapshot: '새 원문', confidence: '0.6' })
  })

  it('메모만 고치면 해시와 상태를 건드리지 않는다 — stale 이 풀리지 않는다', () => {
    const result = applyManualUpdate('k', previous({ status: 'stale' }), { text: 'Old text', status: 'stale', note: '확인 중' }, master, ko)
    expect(result.ok && result.row).toMatchObject({ status: 'stale', source_hash: 'old', source_snapshot: '옛 원문', note: '확인 중' })
  })

  it('stale 은 고를 수 없다', () => {
    expect(applyManualUpdate('k', previous(), { text: 'Old text', status: 'stale' }, master, ko).ok).toBe(false)
    expect(applyManualUpdate('k', previous({ status: 'stale' }), { text: 'Changed', status: 'stale' }, master, ko).ok).toBe(false)
  })

  it('글을 비우면 미번역만 된다', () => {
    expect(applyManualUpdate('k', previous(), { text: ' ', status: 'draft' }, master, ko).ok).toBe(false)
    const result = applyManualUpdate('k', previous(), { text: '', status: 'untranslated' }, master, ko)
    expect(result.ok && result.row).toMatchObject({ status: 'untranslated', source_snapshot: '', confidence: '', source_hash: 'new' })
  })

  it('글이 있는 행은 미번역이 될 수 없다', () => {
    expect(applyManualUpdate('k', previous(), { text: 'x', status: 'untranslated' }, master, ko).ok).toBe(false)
  })

  it('후보를 적용할 때는 넘겨받은 신뢰도와 메모를 쓴다', () => {
    const result = applyManualUpdate('k', previous({ status: 'approved' }), { text: 'Cand', status: 'draft', confidence: '0.9', note: '에이전트 메모' }, master, ko)
    expect(result.ok && result.row).toMatchObject({ status: 'draft', confidence: '0.9', note: '에이전트 메모' })
  })
})
