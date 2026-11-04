import type { Messages } from '@shared/i18n'

/** 업데이트가 실패한 단계. 같은 원인이라도 안내 문장이 다르다 */
export type UpdatePhase = 'check' | 'download'

export type UpdateErrorView = { message: string; detail: string | null }

/** 오류 객체에서 code·message 를 꺼낸다. electron-updater 는 Error 에 code 를 붙여 던진다 */
function errorParts(error: unknown): { code: string | null; message: string } {
  if (error instanceof Error) {
    const code: unknown = Reflect.get(error, 'code')
    return { code: typeof code === 'string' ? code : null, message: error.message }
  }
  return { code: null, message: String(error) }
}

/** 오류 코드가 이 묶음에 드는지 */
function isOneOf(code: string | null, codes: readonly string[]): boolean {
  return code !== null && codes.includes(code)
}

/** 릴리스나 업데이트 정보 파일을 찾지 못했다(아직 공개한 릴리스가 없거나 저장소를 볼 수 없다) */
const NOT_PUBLISHED = [
  'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
  'ERR_UPDATER_NO_PUBLISHED_VERSIONS',
  'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
  'ERR_UPDATER_RELEASE_NOT_FOUND',
  'ERR_UPDATER_ASSET_NOT_FOUND',
  'ERR_UPDATER_INVALID_RELEASE_FEED',
  'HTTP_ERROR_404'
]

/** Node 네트워크 오류 */
const OFFLINE = ['ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN']

/** 파일 잠금·권한 */
const FILE_LOCKED = ['EBUSY', 'EPERM', 'EACCES']

/**
 * 업데이트 오류를 사용자에게 보여 줄 문장으로 바꾼다. 판단은 오류 코드와 Chromium 네트워크 오류 이름(net::ERR_…)으로만 하고,
 * 원래 메시지는 detail 에 그대로 남긴다.
 */
export function describeUpdateError(error: unknown, phase: UpdatePhase, t: Messages): UpdateErrorView {
  const { code, message } = errorParts(error)
  const detail = message.trim() === '' ? null : message.trim().split('\n').slice(0, 6).join('\n')

  const offline =
    /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION_|NETWORK_|TIMED_OUT|ADDRESS_UNREACHABLE|PROXY_)/.test(message) ||
    isOneOf(code, OFFLINE)
  if (offline) {
    return { message: t.updateErrors.offline, detail }
  }
  if (isOneOf(code, NOT_PUBLISHED)) {
    return { message: t.updateErrors.notPublished, detail }
  }
  if (code === 'ERR_CHECKSUM_MISMATCH') {
    return { message: t.updateErrors.checksum, detail }
  }
  if (isOneOf(code, FILE_LOCKED)) {
    return { message: t.updateErrors.fileLocked, detail }
  }
  if (typeof code === 'string' && /^HTTP_ERROR_5\d\d$/.test(code)) {
    return { message: t.updateErrors.serverError, detail }
  }
  return {
    message: phase === 'check' ? t.updateErrors.checkFailed : t.updateErrors.downloadFailed,
    detail
  }
}

/** 받는 중 진행률(0~100 정수). electron-updater 의 percent 가 비었거나 범위를 넘으면 바이트 수로 계산한다 */
export function downloadPercent(percent: number, transferred: number, total: number): number {
  const raw = Number.isFinite(percent) ? percent : total > 0 ? (transferred / total) * 100 : 0
  return Math.min(100, Math.max(0, Math.floor(raw)))
}
