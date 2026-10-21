import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import { CreateProjectInput, OpenProjectInput, type OpenProject } from '@shared/schema/project'
import { fail, ok, type IpcResult } from '@shared/types'
import { createProject, openProject } from '../project/open'
import { cancelActiveJob } from '../jobs/translate-job'
import { forgetReadHashes } from '../project/store'
import { stopWatching, watchProject } from '../project/watcher'
import { updateAppSettings } from '../store/app-settings'

/** 메인이 들고 있는 현재 열린 프로젝트. 렌더러에서 넘어온 경로를 그대로 믿지 않기 위한 기준점. */
let current: OpenProject | null = null

export function currentProject(): OpenProject | null {
  return current
}

/** 메인이 project.json 을 고친 뒤 들고 있는 설정도 맞춘다. */
export function replaceCurrentConfig(config: OpenProject['config']): void {
  if (current) current = { ...current, config }
}

/**
 * project.json 이 앱 밖에서 바뀌면 다시 읽어 메인 설정과 화면을 맞춘다.
 * 읽기에 실패하면(저장 도중이거나 잘못 고친 경우) 이전 설정을 그대로 둔다.
 */
function reloadConfig(dir: string, sender: WebContents): void {
  if (!current || current.dir !== dir) return
  const result = openProject(dir)
  if (!result.ok) return
  current = result.value
  if (!sender.isDestroyed()) sender.send(IPC_EVENT.projectChanged, result.value)
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
      const { dir } = result.value
      void watchProject(dir, event.sender, () => reloadConfig(dir, event.sender))
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
      const { dir } = result.value
      void watchProject(dir, event.sender, () => reloadConfig(dir, event.sender))
      updateAppSettings({ lastProjectDir: result.value.dir })
    }
    return result
  })

  ipcMain.handle(IPC.projectClose, (): IpcResult<null> => {
    current = null
    cancelActiveJob()
    forgetReadHashes()
    void stopWatching()
    updateAppSettings({ lastProjectDir: null })
    return ok(null)
  })
}
