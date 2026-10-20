import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { CreateProjectInput, OpenProjectInput, type OpenProject } from '@shared/schema/project'
import { fail, ok, type IpcResult } from '@shared/types'
import { createProject, openProject } from '../project/open'
import { forgetReadHashes } from '../project/store'
import { stopWatching, watchProject } from '../project/watcher'
import { updateAppSettings } from '../store/app-settings'

/** 메인이 들고 있는 현재 열린 프로젝트. 렌더러에서 넘어온 경로를 그대로 믿지 않기 위한 기준점. */
let current: OpenProject | null = null

export function currentProject(): OpenProject | null {
  return current
}

export function registerProjectIpc(): void {
  ipcMain.handle(IPC.projectPick, async (event): Promise<IpcResult<string>> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await (window
      ? dialog.showOpenDialog(window, {
          title: '프로젝트 폴더 선택',
          properties: ['openDirectory', 'createDirectory'],
          buttonLabel: '선택'
        })
      : dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] }))
    const dir = result.filePaths[0]
    if (result.canceled || !dir) return fail('cancelled', '폴더 선택을 취소했습니다.')
    return ok(dir)
  })

  ipcMain.handle(IPC.projectCreate, (event, raw: unknown): IpcResult<OpenProject> => {
    const parsed = CreateProjectInput.safeParse(raw)
    if (!parsed.success) {
      return fail('unknown', '프로젝트 생성 정보가 올바르지 않습니다.', parsed.error.message)
    }
    const result = createProject(parsed.data)
    if (result.ok) {
      current = result.value
      forgetReadHashes()
      void watchProject(result.value.dir, event.sender)
      updateAppSettings({ lastProjectDir: result.value.dir })
    }
    return result
  })

  ipcMain.handle(IPC.projectOpen, (event, raw: unknown): IpcResult<OpenProject> => {
    const parsed = OpenProjectInput.safeParse(raw)
    if (!parsed.success) {
      return fail('unknown', '프로젝트 경로가 올바르지 않습니다.', parsed.error.message)
    }
    const result = openProject(parsed.data.dir)
    if (result.ok) {
      current = result.value
      forgetReadHashes()
      void watchProject(result.value.dir, event.sender)
      updateAppSettings({ lastProjectDir: result.value.dir })
    }
    return result
  })

  ipcMain.handle(IPC.projectClose, (): IpcResult<null> => {
    current = null
    forgetReadHashes()
    void stopWatching()
    updateAppSettings({ lastProjectDir: null })
    return ok(null)
  })
}
