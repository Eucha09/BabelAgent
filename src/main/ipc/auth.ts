import { ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import { AuthLoginStartInput, type AuthLoginDone, type AuthStatus } from '@shared/schema/agent'
import { fail, type IpcResult } from '@shared/types'
import { cancelLogin, logout, readAuthStatus, startLogin } from '../agent/auth'
import { loadAppSettings } from '../store/app-settings'
import { msg } from '../i18n'

function send(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

export function registerAuthIpc(): void {
  ipcMain.handle(IPC.authStatus, async (): Promise<IpcResult<AuthStatus>> => {
    const { cliPath, claudeConfigDir } = loadAppSettings()
    return readAuthStatus(cliPath, claudeConfigDir)
  })

  ipcMain.handle(IPC.authLoginStart, (event, raw: unknown): IpcResult<null> => {
    const parsed = AuthLoginStartInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', msg().errors.invalidLoginMethod, parsed.error.message)
    const { cliPath, claudeConfigDir } = loadAppSettings()
    const sender = event.sender
    return startLogin(cliPath, claudeConfigDir, parsed.data.method, (payload: AuthLoginDone) =>
      send(sender, IPC_EVENT.authLoginDone, payload)
    )
  })

  ipcMain.handle(IPC.authLoginCancel, (): IpcResult<boolean> => cancelLogin())

  ipcMain.handle(IPC.authLogout, async (): Promise<IpcResult<null>> => {
    const { cliPath, claudeConfigDir } = loadAppSettings()
    return logout(cliPath, claudeConfigDir)
  })

}
