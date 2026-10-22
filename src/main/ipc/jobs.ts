import { ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import { JobControlInput, StartTranslateInput, type JobView } from '@shared/schema/jobs'
import { fail, type IpcResult } from '@shared/types'
import { controlJob, currentJob, startTranslateJob } from '../jobs/translate-job'
import { saveProjectConfig } from '../project/open'
import { loadAppSettings } from '../store/app-settings'
import { currentProject, replaceCurrentConfig } from './project'

function send(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

export function registerJobsIpc(): void {
  ipcMain.handle(IPC.jobStart, (event, raw: unknown): IpcResult<JobView> => {
    const parsed = StartTranslateInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '번역 요청 형식이 올바르지 않습니다.', parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')

    // 고른 모델과 사고 수준을 기억한다. 저장에 실패해도 번역은 진행한다.
    const { model, effort } = parsed.data
    if (project.config.translate.model !== model || project.config.translate.effort !== effort) {
      const config = { ...project.config, translate: { model, effort } }
      if (saveProjectConfig(project.dir, config).ok) replaceCurrentConfig(config)
    }

    const { cliPath, claudeConfigDir } = loadAppSettings()
    const sender = event.sender
    return startTranslateJob(
      currentProject() ?? project,
      parsed.data,
      { cliPath, configDir: claudeConfigDir },
      {
        update: (view) => send(sender, IPC_EVENT.jobUpdate, view),
        log: (entry) => send(sender, IPC_EVENT.jobLog, entry)
      }
    )
  })

  ipcMain.handle(IPC.jobControl, (_event, raw: unknown): IpcResult<null> => {
    const parsed = JobControlInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '작업 제어 요청이 올바르지 않습니다.')
    return controlJob(parsed.data.action)
  })

  ipcMain.handle(IPC.jobCurrent, (): JobView | null => currentJob())
}
