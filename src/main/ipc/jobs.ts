import { ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import { JobControlInput, StartTranslateInput, type DataWritten, type JobView } from '@shared/schema/jobs'
import { fail, type IpcResult } from '@shared/types'
import { controlJob, currentJob, type JobSink } from '../jobs/runner'
import { startTranslateJob } from '../jobs/translate-job'
import { saveProjectConfig } from '../project/open'
import { loadAppSettings } from '../store/app-settings'
import { currentProject, replaceCurrentConfig } from './project'
import { msg } from '../i18n'

export function send(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

/** 작업의 진행·로그·파일 기록을 요청한 창으로 보낸다. 번역·컨텍스트 추정·용어 추출이 같이 쓴다. */
export function jobSink(sender: WebContents): JobSink {
  return {
    update: (view) => send(sender, IPC_EVENT.jobUpdate, view),
    log: (entry) => send(sender, IPC_EVENT.jobLog, entry),
    written: (file) => {
      const payload: DataWritten = { file }
      send(sender, IPC_EVENT.dataWritten, payload)
    }
  }
}

/** 배치 작업의 CLI 실행 정보. 앱 설정에서 읽는다. */
export function agentAuth(): { cliPath: string | null; configDir: string | null } {
  const { cliPath, claudeConfigDir } = loadAppSettings()
  return { cliPath, configDir: claudeConfigDir }
}

export function registerJobsIpc(): void {
  ipcMain.handle(IPC.jobStart, (event, raw: unknown): IpcResult<JobView> => {
    const parsed = StartTranslateInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', msg().errors.invalidRequest, parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', msg().errors.notAProject)

    // 고른 모델과 사고 수준을 기억한다. 저장에 실패해도 번역은 진행한다.
    const { model, effort } = parsed.data
    if (project.config.translate.model !== model || project.config.translate.effort !== effort) {
      const config = { ...project.config, translate: { model, effort } }
      if (saveProjectConfig(project.dir, config).ok) replaceCurrentConfig(config)
    }

    return startTranslateJob(currentProject() ?? project, parsed.data, agentAuth(), jobSink(event.sender))
  })

  ipcMain.handle(IPC.jobControl, (_event, raw: unknown): IpcResult<null> => {
    const parsed = JobControlInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', msg().errors.invalidRequest)
    return controlJob(parsed.data.action)
  })

  ipcMain.handle(IPC.jobCurrent, (): JobView | null => currentJob())
}
