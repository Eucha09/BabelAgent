import { ipcMain } from 'electron'
import { AppSettingsPatch, type AppSettings } from '@shared/schema/app-settings'
import { IPC } from '@shared/ipc'
import { fail, ok, type IpcResult } from '@shared/types'
import { msg, setUiLanguage } from '../i18n'
import { loadAppSettings, updateAppSettings } from '../store/app-settings'

export function registerAppSettingsIpc(): void {
  ipcMain.handle(IPC.appSettingsGet, (): IpcResult<AppSettings> => ok(loadAppSettings()))

  ipcMain.handle(IPC.appSettingsSet, (_event, raw: unknown): IpcResult<AppSettings> => {
    const parsed = AppSettingsPatch.safeParse(raw)
    if (!parsed.success) {
      return fail('unknown', msg().errors.settingsInvalid, parsed.error.message)
    }
    try {
      const saved = updateAppSettings(parsed.data)
      if (parsed.data.uiLanguage) setUiLanguage(parsed.data.uiLanguage)
      return ok(saved)
    } catch (error) {
      return fail('io', msg().errors.settingsSaveFailed, error instanceof Error ? error.message : String(error))
    }
  })
}
