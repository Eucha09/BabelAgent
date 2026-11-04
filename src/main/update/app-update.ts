import { BrowserWindow, app } from 'electron'
import { CancellationToken, autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import { describeUpdateError, downloadPercent, type UpdatePhase } from '@core/update/app-update'
import { IPC_EVENT } from '@shared/ipc'
import type { AppUpdateState, AppUpdateStatus } from '@shared/schema/app-update'
import { fail, ok, type IpcResult } from '@shared/types'
import { msg } from '../i18n'

/**
 * 앱 자동 업데이트. 새 버전은 GitHub Releases(electron-builder.yml 의 publish)에서 확인한다.
 * 확인은 자동으로 하지만 받기는 사용자가 [받기]를 눌러야 시작한다. 받아 둔 업데이트는 [다시 시작해 설치]나 앱을 끌 때 설치된다.
 * 설치 파일은 코드 서명이 없으므로 서명 검사는 건너뛰고, 받은 파일은 latest.yml 의 sha512 로 검사한다(electron-updater 기본 동작).
 */

/** electron-builder.yml 의 publish 와 같은 저장소 */
const RELEASES_URL = 'https://github.com/Eucha09/BabelAgent/releases'

/** 켜 둔 동안 다시 확인하는 간격 */
const RECHECK_MS = 6 * 60 * 60 * 1000

let state: AppUpdateState = { kind: 'idle' }
/** 지금 단계. error 이벤트가 확인 중에 났는지 받는 중에 났는지 가른다 */
let phase: UpdatePhase = 'check'
/** 확인에서 찾은 새 버전 */
let foundVersion: string | null = null
/** 받는 중인 다운로드를 멈출 때 쓴다 */
let downloadToken: CancellationToken | null = null
let checking: Promise<void> | null = null
let initialized = false

export function appUpdateStatus(): AppUpdateStatus {
  return { currentVersion: app.getVersion(), state, releasesUrl: RELEASES_URL }
}

function setState(next: AppUpdateState): void {
  state = next
  const status = appUpdateStatus()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) window.webContents.send(IPC_EVENT.appUpdateState, status)
  }
}

function availableState(info: UpdateInfo): AppUpdateState {
  return { kind: 'available', version: info.version, releaseDate: info.releaseDate || null }
}

function errorState(error: unknown, during: UpdatePhase): AppUpdateState {
  return { kind: 'error', ...describeUpdateError(error, during, msg()), version: during === 'download' ? foundVersion : null }
}

/** 업데이트를 확인하지 않는 환경이면 이유를 돌려준다 */
function disabledReason(): string | null {
  if (!app.isPackaged) return msg().errors.updateDevMode
  if (process.platform !== 'win32') return msg().errors.updateUnsupportedOs
  return null
}

/** 앱이 준비되면 한 번 부른다. 첫 확인은 화면이 Claude Code 확인을 끝낸 뒤 요청한다 */
export function initAppUpdate(): void {
  if (initialized) return
  initialized = true

  const reason = disabledReason()
  if (reason !== null) {
    state = { kind: 'disabled', reason }
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => setState({ kind: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    foundVersion = info.version
    setState(availableState(info))
  })
  autoUpdater.on('update-not-available', () => {
    foundVersion = null
    setState({ kind: 'current', checkedAt: new Date().toISOString() })
  })
  autoUpdater.on('download-progress', (info: ProgressInfo) => {
    setState({
      kind: 'downloading',
      version: foundVersion ?? '',
      percent: downloadPercent(info.percent, info.transferred, info.total),
      transferred: info.transferred,
      total: info.total
    })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => setState({ kind: 'downloaded', version: info.version }))
  autoUpdater.on('update-cancelled', (info: UpdateInfo) => setState(availableState(info)))
  autoUpdater.on('error', (error: unknown) => setState(errorState(error, phase)))

  // 켜 둔 채로 오래 쓰는 사용자도 새 버전을 알 수 있게 주기적으로 다시 확인한다
  setInterval(() => void checkAppUpdate(), RECHECK_MS).unref()
}

/** 새 버전이 있는지 확인한다. 받는 중이거나 이미 받아 두었으면 다시 확인하지 않는다 */
export async function checkAppUpdate(): Promise<AppUpdateStatus> {
  if (state.kind === 'disabled' || state.kind === 'downloading' || state.kind === 'downloaded') return appUpdateStatus()
  if (checking === null) {
    phase = 'check'
    checking = autoUpdater
      .checkForUpdates()
      .then(() => undefined)
      .catch((error: unknown) => {
        // 보통은 error 이벤트가 먼저 상태를 바꾼다. 이벤트 없이 실패했을 때만 여기서 바꾼다
        if (state.kind === 'checking' || state.kind === 'idle') setState(errorState(error, 'check'))
      })
      .finally(() => {
        checking = null
      })
  }
  await checking
  return appUpdateStatus()
}

/** 확인에서 찾은 새 버전을 받기 시작한다. 진행률과 결과는 상태 이벤트로 알린다 */
export function downloadAppUpdate(): IpcResult<null> {
  const version = state.kind === 'available' ? state.version : state.kind === 'error' ? state.version : null
  if (version === null) return fail('invalid-input', msg().errors.noUpdateToDownload)

  phase = 'download'
  const token = new CancellationToken()
  downloadToken = token
  setState({ kind: 'downloading', version, percent: 0, transferred: 0, total: 0 })
  autoUpdater
    .downloadUpdate(token)
    .catch((error: unknown) => {
      // 취소는 update-cancelled, 그 밖의 실패는 error 이벤트가 상태를 바꾼다. 이벤트가 없었을 때만 여기서 바꾼다
      if (state.kind !== 'downloading') return
      setState(token.cancelled ? { kind: 'available', version, releaseDate: null } : errorState(error, 'download'))
    })
    .finally(() => {
      if (downloadToken === token) downloadToken = null
    })
  return ok(null)
}

/** 받는 중이면 멈춘다. 멈췄으면 true */
export function cancelAppUpdateDownload(): boolean {
  if (downloadToken === null) return false
  downloadToken.cancel()
  return true
}

/** 받아 둔 업데이트를 설치한다. 앱을 닫고 조용히 설치한 뒤 다시 연다 */
export function installAppUpdate(): IpcResult<null> {
  if (state.kind !== 'downloaded') return fail('invalid-input', msg().errors.noUpdateToInstall)
  // 응답을 먼저 돌려준 뒤 닫는다
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
  return ok(null)
}
