import { ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import type { ClaudeCliStatus, ClaudeInstallDone, ClaudeUpdateResult } from '@shared/schema/cli'
import { fail, ok, type IpcResult } from '@shared/types'
import { cancelClaudeInstall, claudeStatus, startClaudeInstall, updateClaude } from '../agent/claude-cli'
import { ensureNoRunningJob } from '../jobs/runner'
import { loadAppSettings } from '../store/app-settings'
import { msg } from '../i18n'

function send(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

export function registerCliIpc(): void {
  ipcMain.handle(IPC.cliStatus, async (): Promise<IpcResult<ClaudeCliStatus>> => {
    const { cliPath, claudeConfigDir } = loadAppSettings()
    return ok(await claudeStatus(cliPath, claudeConfigDir))
  })

  ipcMain.handle(IPC.cliUpdate, async (): Promise<IpcResult<ClaudeUpdateResult>> => {
    // 작업이 도는 중에는 실행 파일을 바꾸지 않는다(Windows 는 실행 중인 파일을 잠근다)
    const idle = ensureNoRunningJob()
    if (!idle.ok) return fail(idle.error.kind, msg().errors.updateAfterJob(idle.error.message))
    const { cliPath, claudeConfigDir } = loadAppSettings()
    return updateClaude(cliPath, claudeConfigDir)
  })

  ipcMain.handle(IPC.cliInstall, (event): IpcResult<null> => {
    const sender = event.sender
    return startClaudeInstall((payload: ClaudeInstallDone) => send(sender, IPC_EVENT.cliInstallDone, payload))
  })

  ipcMain.handle(IPC.cliInstallCancel, (): IpcResult<boolean> => ok(cancelClaudeInstall()))
}
