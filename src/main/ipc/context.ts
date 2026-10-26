import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import {
  ApplyContextInput,
  DiscardContextInput,
  StartContextInput,
  type ApplyContextResult,
  type ContextView
} from '@shared/schema/context'
import type { JobView } from '@shared/schema/jobs'
import { fail, ok, type IpcResult } from '@shared/types'
import { startContextJob } from '../jobs/context-job'
import { applyContextSuggestions, discardContextSuggestions, loadContextSuggestions, loadMaster } from '../project/store'
import { agentAuth, jobSink } from './jobs'
import { currentProject } from './project'

export function registerContextIpc(): void {
  /** 제안과 지금 원문 행을 나란히. 제안한 뒤 원문이 바뀌었는지(stale)는 해시로 본다. */
  ipcMain.handle(IPC.contextList, (): IpcResult<ContextView> => {
    const project = currentProject()
    if (!project) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')
    const suggestions = loadContextSuggestions(project.dir)
    if (!suggestions.ok) return suggestions
    const master = loadMaster(project.dir)
    if (!master.ok) return master
    const byKey = new Map(master.value.rows.map((row) => [row.key, row]))
    return ok({
      suggestions: suggestions.value.rows.map((suggestion) => {
        const row = byKey.get(suggestion.key)
        return {
          ...suggestion,
          source: row?.source ?? '',
          current: {
            context: row?.context ?? '',
            ui_type: row?.ui_type ?? '',
            max_len: row?.max_len ?? '',
            vars: row?.vars ?? ''
          },
          stale: row !== undefined && row.source_hash !== suggestion.source_hash,
          missing: row === undefined
        }
      }),
      notices: suggestions.value.notice ? [suggestions.value.notice] : []
    })
  })

  ipcMain.handle(IPC.contextEstimate, (event, raw: unknown): IpcResult<JobView> => {
    const parsed = StartContextInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '컨텍스트 추정 요청 형식이 올바르지 않습니다.', parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')
    return startContextJob(project, parsed.data, agentAuth(), jobSink(event.sender))
  })

  ipcMain.handle(IPC.contextApply, (_event, raw: unknown): IpcResult<ApplyContextResult> => {
    const parsed = ApplyContextInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '제안 적용 요청 형식이 올바르지 않습니다.', parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')
    return applyContextSuggestions(project.dir, parsed.data.items)
  })

  ipcMain.handle(IPC.contextDiscard, (_event, raw: unknown): IpcResult<number> => {
    const parsed = DiscardContextInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '제안 버리기 요청 형식이 올바르지 않습니다.', parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')
    return discardContextSuggestions(project.dir, parsed.data.keys)
  })
}
