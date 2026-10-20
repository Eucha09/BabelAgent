import { ipcMain } from 'electron'
import { AppSettingsPatch, type AppSettings } from '@shared/schema/app-settings'
import { IPC } from '@shared/ipc'
import { fail, ok, type IpcResult } from '@shared/types'
import { loadAppSettings, updateAppSettings } from '../store/app-settings'

export function registerAppSettingsIpc(): void {
  ipcMain.handle(IPC.appSettingsGet, (): IpcResult<AppSettings> => ok(loadAppSettings()))

  ipcMain.handle(IPC.appSettingsSet, (_event, raw: unknown): IpcResult<AppSettings> => {
    const parsed = AppSettingsPatch.safeParse(raw)
    if (!parsed.success) {
      return fail('unknown', '설정 값이 올바르지 않습니다.', parsed.error.message)
    }
    try {
      return ok(updateAppSettings(parsed.data))
    } catch (error) {
      return fail('io', '설정을 저장하지 못했습니다.', error instanceof Error ? error.message : String(error))
    }
  })
}
