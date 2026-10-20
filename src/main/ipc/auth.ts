import { ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import {
  AuthLoginInput,
  type AuthLoginDone,
  type AuthLoginOutput,
  type AuthStatus
} from '@shared/schema/agent'
import { fail, type IpcResult } from '@shared/types'
import { cancelLogin, logout, readAuthStatus, sendLoginInput, startLogin } from '../agent/auth'
import { loadAppSettings } from '../store/app-settings'

function send(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

export function registerAuthIpc(): void {
  ipcMain.handle(IPC.authStatus, async (): Promise<IpcResult<AuthStatus>> => {
    const { cliPath, claudeConfigDir } = loadAppSettings()
    return readAuthStatus(cliPath, claudeConfigDir)
  })

  ipcMain.handle(IPC.authLoginStart, (event): IpcResult<null> => {
    const { cliPath, claudeConfigDir } = loadAppSettings()
    const sender = event.sender
    return startLogin(cliPath, claudeConfigDir, {
      output: (payload: AuthLoginOutput) => send(sender, IPC_EVENT.authLoginOutput, payload),
      done: (payload: AuthLoginDone) => send(sender, IPC_EVENT.authLoginDone, payload)
    })
  })

  ipcMain.handle(IPC.authLoginInput, (_event, raw: unknown): IpcResult<null> => {
    const parsed = AuthLoginInput.safeParse(raw)
    if (!parsed.success) return fail('unknown', '입력 형식이 올바르지 않습니다.')
    return sendLoginInput(parsed.data.text)
  })

  ipcMain.handle(IPC.authLoginCancel, (): IpcResult<boolean> => cancelLogin())

  ipcMain.handle(IPC.authLogout, async (): Promise<IpcResult<null>> => {
    const { cliPath, claudeConfigDir } = loadAppSettings()
    return logout(cliPath, claudeConfigDir)
  })

}
