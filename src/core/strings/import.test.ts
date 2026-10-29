import { describe, expect, it } from 'vitest'
import type { ColumnMapping, MasterRow } from '@shared/schema/strings'
import { sourceHash } from '../hash'
import { guessMapping, importMaster } from './import'

const EMPTY_MAPPING: ColumnMapping = {
  key: 'key',
  source: 'source',
  context: '',
  ui_type: '',
  max_len: '',
  vars: '',
  smart: '',
  tags: ''
}

function master(key: string, source: string, extra: Partial<MasterRow> = {}): MasterRow {
  return {
    key,
    source,
    context: '',
    ui_type: '',
    max_len: '',
    vars: '',
    smart: '',
    tags: '',
    source_hash: sourceHash(source),
    ...extra
  }
}

describe('guessMapping', () => {
  it('흔한 열 이름을 맞춘다', () => {
    const mapping = guessMapping(['Key', 'Source', 'Context', 'Tags'])
    expect(mapping.key).toBe('Key')
    expect(mapping.source).toBe('Source')
    expect(mapping.context).toBe('Context')
    expect(mapping.tags).toBe('Tags')
  })

  it('한국어 열 이름도 맞춘다', () => {
    const mapping = guessMapping(['키', '원문', '설명'])
    expect(mapping.key).toBe('키')
    expect(mapping.source).toBe('원문')
    expect(mapping.context).toBe('설명')
  })

  it('없으면 빈 문자열', () => {
    expect(guessMapping(['a', 'b']).key).toBe('')
  })
})

describe('importMaster', () => {
  it('새 키는 추가한다', () => {
    const result = importMaster([], [{ key: 'k1', source: '안녕' }], EMPTY_MAPPING)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.source_hash).toBe(sourceHash('안녕'))
    expect(result.summary.added).toBe(1)
  })

  it('원문이 바뀐 키는 changed로 센다', () => {
    const result = importMaster(
      [master('k1', '안녕')],
      [{ key: 'k1', source: '안녕하세요' }],
      EMPTY_MAPPING
    )
    expect(result.summary).toMatchObject({ added: 0, changed: 1, unchanged: 0 })
    expect(result.rows[0]?.source_hash).toBe(sourceHash('안녕하세요'))
  })

  it('같은 원문은 unchanged', () => {
    const result = importMaster([master('k1', '안녕')], [{ key: 'k1', source: '안녕' }], EMPTY_MAPPING)
    expect(result.summary.unchanged).toBe(1)
  })

  it('매핑하지 않은 열은 기존 값을 지우지 않는다', () => {
    const result = importMaster(
      [master('k1', '안녕', { context: '인사말', tags: 'ui' })],
      [{ key: 'k1', source: '안녕하세요' }],
      EMPTY_MAPPING
    )
    expect(result.rows[0]?.context).toBe('인사말')
    expect(result.rows[0]?.tags).toBe('ui')
  })

  it('매핑한 열은 덮어쓴다', () => {
    const mapping: ColumnMapping = { ...EMPTY_MAPPING, context: 'desc' }
    const result = importMaster(
      [master('k1', '안녕', { context: '옛 설명' })],
      [{ key: 'k1', source: '안녕', desc: '새 설명' }],
      mapping
    )
    expect(result.rows[0]?.context).toBe('새 설명')
  })

  it('이번 파일에 없는 키는 지우지 않고 보고한다', () => {
    const result = importMaster(
      [master('k1', '안녕'), master('k2', '잘가')],
      [{ key: 'k1', source: '안녕' }],
      EMPTY_MAPPING
    )
    expect(result.rows).toHaveLength(2)
    expect(result.summary.missing).toEqual(['k2'])
  })

  it('파일 안 중복 키는 첫 행만 쓴다', () => {
    const result = importMaster(
      [],
      [
        { key: 'k1', source: '처음' },
        { key: 'k1', source: '나중' }
      ],
      EMPTY_MAPPING
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.source).toBe('처음')
    expect(result.summary.duplicates).toEqual(['k1'])
  })

  it('빈 키 행은 건너뛰고 센다', () => {
    const result = importMaster(
      [],
      [
        { key: '  ', source: '무시' },
        { key: 'k1', source: '안녕' }
      ],
      EMPTY_MAPPING
    )
    expect(result.rows).toHaveLength(1)
    expect(result.summary.emptyKeys).toBe(1)
  })

  it('기존 행 순서를 유지하고 새 키는 뒤에 붙인다', () => {
    const result = importMaster(
      [master('k1', 'a'), master('k2', 'b')],
      [
        { key: 'k3', source: 'c' },
        { key: 'k1', source: 'a' }
      ],
      EMPTY_MAPPING
    )
    expect(result.rows.map((row) => row.key)).toEqual(['k1', 'k2', 'k3'])
  })
})
