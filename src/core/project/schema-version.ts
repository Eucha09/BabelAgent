/** 앱이 읽고 쓸 수 있는 project.json 스키마 버전. 포맷을 바꿀 때만 올린다. */
export const SUPPORTED_SCHEMA_VERSION = 1

export type SchemaVersionVerdict =
  | { kind: 'ok'; version: number }
  /** 마이그레이션이 필요한 하위 버전. M1에는 마이그레이션 함수가 없어 아직 발생하지 않는다. */
  | { kind: 'migrate'; from: number; to: number }
  /** 앱보다 높은 버전 — 열기를 거부한다. */
  | { kind: 'too-new'; found: number; supported: number }
  | { kind: 'invalid'; found: unknown }

/**
 * project.json의 schemaVersion을 판정한다.
 * 상위 버전을 추측으로 열면 데이터를 깨뜨리므로 거부가 기본이다.
 */
export function checkSchemaVersion(
  found: unknown,
  supported: number = SUPPORTED_SCHEMA_VERSION
): SchemaVersionVerdict {
  if (typeof found !== 'number' || !Number.isInteger(found) || found < 1) {
    return { kind: 'invalid', found }
  }
  if (found > supported) return { kind: 'too-new', found, supported }
  if (found < supported) return { kind: 'migrate', from: found, to: supported }
  return { kind: 'ok', version: found }
}
