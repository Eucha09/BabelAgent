import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppUpdateStatus } from '@shared/schema/app-update'
import { fail, ok, type IpcResult } from '@shared/types'
import { ensureNoRunningJob } from '../jobs/runner'
import {
  appUpdateStatus,
  cancelAppUpdateDownload,
  checkAppUpdate,
  downloadAppUpdate,
  installAppUpdate
} from '../update/app-update'

export function registerAppUpdateIpc(): void {
  ipcMain.handle(IPC.appUpdateStatus, (): IpcResult<AppUpdateStatus> => ok(appUpdateStatus()))

  ipcMain.handle(IPC.appUpdateCheck, async (): Promise<IpcResult<AppUpdateStatus>> => ok(await checkAppUpdate()))

  ipcMain.handle(IPC.appUpdateDownload, (): IpcResult<null> => downloadAppUpdate())

  ipcMain.handle(IPC.appUpdateCancel, (): IpcResult<boolean> => ok(cancelAppUpdateDownload()))

  ipcMain.handle(IPC.appUpdateInstall, (): IpcResult<null> => {
    // 번역 등 작업이 도는 중에 앱을 닫으면 진행 중인 배치가 버려진다
    const idle = ensureNoRunningJob()
    if (!idle.ok) return fail(idle.error.kind, `작업이 끝난 뒤에 다시 시작할 수 있습니다. ${idle.error.message}`)
    return installAppUpdate()
  })
}
