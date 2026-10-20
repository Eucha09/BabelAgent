/** IPC 호출 결과. 오류를 예외로 던지지 않고 원인을 값으로 돌려준다. */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: IpcError }

export type IpcError = {
  kind: IpcErrorKind
  message: string
  detail?: string
}

export type IpcErrorKind =
  /** project.json이 없는 폴더를 열려고 함 */
  | 'not-a-project'
  /** 폴더에 이미 project.json이 있음 */
  | 'already-a-project'
  /** 앱보다 높은 schemaVersion */
  | 'schema-too-new'
  /** JSON 파싱 또는 스키마 검증 실패 */
  | 'invalid-project'
  /** 요청 값이 규칙에 맞지 않음(빈 키, 중복 키 등) */
  | 'invalid-input'
  /** 앱이 읽은 뒤 파일이 밖에서 바뀜 */
  | 'conflict'
  /** Claude Code CLI 실행 파일을 찾지 못함 */
  | 'cli-not-found'
  /** 읽기/쓰기 실패(권한, 파일 잠금 등) */
  | 'io'
  | 'cancelled'
  | 'unknown'

export function ok<T>(value: T): IpcResult<T> {
  return { ok: true, value }
}

export function fail<T>(kind: IpcErrorKind, message: string, detail?: string): IpcResult<T> {
  return { ok: false, error: detail === undefined ? { kind, message } : { kind, message, detail } }
}
