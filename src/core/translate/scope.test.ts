import { describe, expect, it } from 'vitest'
import type { MasterRow, TranslationRow } from '@shared/schema/strings'
import type { TranslationStatus } from '@shared/schema/project'
import { selectRows } from './scope'

const m = (key: string): MasterRow => ({
  key,
  source: key,
  context: '',
  ui_type: '',
  max_len: '',
  vars: '',
  tags: '',
  source_hash: ''
})
const t = (key: string, status: TranslationStatus, text = 'x'): TranslationRow => ({
  key,
  text,
  source_hash: '',
  source_snapshot: '',
  status,
  confidence: '',
  note: ''
})

const master = ['new', 'draft', 'review', 'approved', 'stale', 'blank'].map(m)
const translations = [
  t('draft', 'draft'),
  t('review', 'review'),
  t('approved', 'approved'),
  t('stale', 'stale'),
  t('blank', 'draft', '  ')
]
const keys = (rows: MasterRow[]): string[] => rows.map((row) => row.key)

describe('selectRows', () => {
  it('전체는 approved 만 빼고 모두', () => {
    const result = selectRows(master, translations, 'all')
    expect(keys(result.rows)).toEqual(['new', 'draft', 'review', 'stale', 'blank'])
    expect(result.skippedApproved).toEqual(['approved'])
  })

  it('미번역은 번역 행이 없거나 비어 있는 것', () => {
    expect(keys(selectRows(master, translations, 'untranslated').rows)).toEqual(['new', 'blank'])
  })

  it('stale 은 stale 상태만', () => {
    expect(keys(selectRows(master, translations, 'stale').rows)).toEqual(['stale'])
  })

  it('선택 행은 고른 키만, approved 는 빼고 알린다', () => {
    const result = selectRows(master, translations, 'selected', new Set(['review', 'approved', 'new']))
    expect(keys(result.rows)).toEqual(['new', 'review'])
    expect(result.skippedApproved).toEqual(['approved'])
  })

  it('원문 순서를 따른다', () => {
    const result = selectRows(master, translations, 'selected', new Set(['stale', 'new']))
    expect(keys(result.rows)).toEqual(['new', 'stale'])
  })
})
