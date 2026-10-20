import { describe, expect, it } from 'vitest'
import { SUPPORTED_SCHEMA_VERSION, checkSchemaVersion } from './schema-version'

describe('checkSchemaVersion', () => {
  it('지원 버전과 같으면 ok', () => {
    expect(checkSchemaVersion(1, 1)).toEqual({ kind: 'ok', version: 1 })
  })

  it('하위 버전은 마이그레이션 대상', () => {
    expect(checkSchemaVersion(1, 3)).toEqual({ kind: 'migrate', from: 1, to: 3 })
  })

  it('상위 버전은 거부', () => {
    expect(checkSchemaVersion(4, 2)).toEqual({ kind: 'too-new', found: 4, supported: 2 })
  })

  it.each([undefined, null, '1', 1.5, 0, -1, Number.NaN, {}])(
    '정수 1 이상이 아니면 invalid: %o',
    (input) => {
      expect(checkSchemaVersion(input).kind).toBe('invalid')
    }
  )

  it('기본 인자는 앱이 지원하는 버전을 쓴다', () => {
    expect(checkSchemaVersion(SUPPORTED_SCHEMA_VERSION)).toEqual({
      kind: 'ok',
      version: SUPPORTED_SCHEMA_VERSION
    })
  })
})
