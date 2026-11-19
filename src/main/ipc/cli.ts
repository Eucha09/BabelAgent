import { clipboard, ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import {
  WINDOWS_INSTALL_COMMAND,
  type ClaudeCliStatus,
  type ClaudeInstallDone,
  type ClaudeUpdateResult
} from '@shared/schema/cli'
import { fail, ok, type IpcResult } from '@shared/types'
import {
  cancelClaudeInstall,
  claudeStatus,
  openPowerShellWindow,
  startClaudeInstall,
  updateClaude
} from '../agent/claude-cli'
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

  // 자동 설치가 막혔을 때의 직접 설치 안내. 복사하는 글은 고정된 공식 설치 명령뿐이다(렌더러가 내용을 정하지 않는다)
  ipcMain.handle(IPC.cliInstallCommandCopy, (): IpcResult<null> => {
    clipboard.writeText(WINDOWS_INSTALL_COMMAND)
    return ok(null)
  })

  ipcMain.handle(IPC.cliPowerShellOpen, (): Promise<IpcResult<null>> => openPowerShellWindow())
}
