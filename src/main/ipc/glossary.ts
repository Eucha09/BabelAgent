import { ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import {
  AddTermInput,
  RetranslateTermInput,
  StartTermsInput,
  StartTermTranslateInput,
  TermAgentCancelInput,
  UpdateGlossaryInput,
  type AddTermResult,
  type GlossaryView,
  type RetranslateTermResult,
  type UpdateGlossaryResult
} from '@shared/schema/glossary'
import type { JobLogEntry, JobView } from '@shared/schema/jobs'
import { fail, ok, type IpcResult } from '@shared/types'
import { cancelTermSession, runTermAddition, runTermRetranslation } from '../jobs/term-add'
import { startTermTranslateJob } from '../jobs/term-translate-job'
import { startTermsJob } from '../jobs/terms-job'
import { loadGlossary, updateGlossary } from '../project/store'
import { agentAuth, jobSink, send } from './jobs'
import { currentProject } from './project'
import { msg } from '../i18n'

/** 용어 추가·재번역 로그는 작업 로그와 같은 곳(번역 화면·에이전트 패널)에 남긴다 */
function jobLogTo(sender: WebContents): (entry: Omit<JobLogEntry, 'at'>) => void {
  return (entry) => {
    const payload: JobLogEntry = { at: new Date().toISOString(), ...entry }
    send(sender, IPC_EVENT.jobLog, payload)
  }
}

export function registerGlossaryIpc(): void {
  ipcMain.handle(IPC.glossaryList, (): IpcResult<GlossaryView> => {
    const project = currentProject()
    if (!project) return fail('not-a-project', msg().errors.notAProject)
    return loadGlossary(project.dir, project.config.targetLanguages)
  })

  ipcMain.handle(IPC.glossaryUpdate, (_event, raw: unknown): IpcResult<UpdateGlossaryResult> => {
    const parsed = UpdateGlossaryInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', msg().errors.invalidRequest, parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', msg().errors.notAProject)
    return updateGlossary(project.dir, parsed.data.changes, project.config.targetLanguages)
  })

  ipcMain.handle(IPC.glossaryExtract, (event, raw: unknown): IpcResult<JobView> => {
    const parsed = StartTermsInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', msg().errors.invalidRequest, parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', msg().errors.notAProject)
    return startTermsJob(project, parsed.data, agentAuth(), jobSink(event.sender))
  })

  ipcMain.handle(IPC.glossaryTranslate, (event, raw: unknown): IpcResult<JobView> => {
    const parsed = StartTermTranslateInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', msg().errors.invalidRequest, parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', msg().errors.notAProject)
    return startTermTranslateJob(project, parsed.data, agentAuth(), jobSink(event.sender))
  })

  ipcMain.handle(IPC.glossaryAdd, async (event, raw: unknown): Promise<IpcResult<AddTermResult>> => {
    const parsed = AddTermInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', msg().errors.invalidRequest, parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', msg().errors.notAProject)
    return runTermAddition(project, parsed.data, agentAuth(), jobLogTo(event.sender))
  })

  ipcMain.handle(IPC.glossaryRetranslate, async (event, raw: unknown): Promise<IpcResult<RetranslateTermResult>> => {
    const parsed = RetranslateTermInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', msg().errors.invalidRequest, parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', msg().errors.notAProject)
    return runTermRetranslation(project, parsed.data, agentAuth(), jobLogTo(event.sender))
  })

  ipcMain.handle(IPC.glossaryAgentCancel, (_event, raw: unknown): IpcResult<boolean> => {
    const parsed = TermAgentCancelInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', msg().errors.invalidRequest)
    return ok(cancelTermSession(parsed.data.requestId))
  })
}
