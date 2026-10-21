import { ipcMain, type WebContents } from 'electron'
import { checkRow } from '@core/qa/check'
import { bulkApproveBlocker } from '@core/review/bulk'
import { IPC, IPC_EVENT } from '@shared/ipc'
import type { JobLogEntry } from '@shared/schema/jobs'
import { QaRunInput, type QaReport } from '@shared/schema/qa'
import {
  BulkApproveInput,
  RerollCancelInput,
  RerollInput,
  UpdateTranslationInput,
  type BulkApproveResult,
  type RerollCandidate,
  type UpdateTranslationResult
} from '@shared/schema/review'
import { fail, ok, type IpcResult } from '@shared/types'
import { cancelReroll, runReroll } from '../jobs/reroll'
import { loadQaContext, runQa, toQaInput } from '../project/qa'
import { approveTranslationRows, loadMaster, trustedSnapshot, updateTranslationRow } from '../project/store'
import { loadAppSettings } from '../store/app-settings'
import { currentProject } from './project'

function send(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

export function registerReviewIpc(): void {
  ipcMain.handle(IPC.qaRun, (_event, raw: unknown): IpcResult<QaReport> => {
    const parsed = QaRunInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', 'QA 요청 형식이 올바르지 않습니다.')
    const project = currentProject()
    if (!project) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')
    if (!project.config.targetLanguages.includes(parsed.data.language)) {
      return fail('invalid-input', `${parsed.data.language} 은 이 프로젝트의 대상 언어가 아닙니다.`)
    }
    return runQa(project, parsed.data.language)
  })

  ipcMain.handle(IPC.translationUpdate, (_event, raw: unknown): IpcResult<UpdateTranslationResult> => {
    const parsed = UpdateTranslationInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '저장 요청 형식이 올바르지 않습니다.', parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')
    const input = parsed.data
    if (!project.config.targetLanguages.includes(input.language)) {
      return fail('invalid-input', `${input.language} 은 이 프로젝트의 대상 언어가 아닙니다.`)
    }

    const master = loadMaster(project.dir)
    if (!master.ok) return master
    const row = master.value.rows.find((item) => item.key === input.key)
    if (!row) return fail('invalid-input', `원문에 없는 키입니다: ${input.key}`)

    const { ctx } = loadQaContext(project, input.language)
    const change = {
      text: input.text,
      status: input.status,
      ...(input.note === undefined ? {} : { note: input.note }),
      ...(input.confidence === undefined ? {} : { confidence: input.confidence })
    }
    const result = updateTranslationRow(
      project.dir,
      input.language,
      { key: input.key, master: row, change, expected: input.expected, force: input.force },
      (next) => checkRow(toQaInput(row, next), ctx)
    )
    if (!result.ok) return result
    const saved = result.value.row
    return ok({
      row: {
        key: saved.key,
        translation: saved.text,
        status: saved.status,
        confidence: saved.confidence,
        note: saved.note,
        source_snapshot: trustedSnapshot(saved)
      },
      diagnostics: result.value.diagnostics
    })
  })

  ipcMain.handle(IPC.translationApprove, (_event, raw: unknown): IpcResult<BulkApproveResult> => {
    const parsed = BulkApproveInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '일괄 승인 요청 형식이 올바르지 않습니다.', parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')
    const { language, rows } = parsed.data
    if (!project.config.targetLanguages.includes(language)) {
      return fail('invalid-input', `${language} 은 이 프로젝트의 대상 언어가 아닙니다.`)
    }

    const master = loadMaster(project.dir)
    if (!master.ok) return master
    const masterByKey = new Map(master.value.rows.map((row) => [row.key, row]))
    const { ctx } = loadQaContext(project, language)
    const lowConfidence = project.config.review.lowConfidence

    // 화면이 고른 조건을 믿지 않고 지금 디스크의 행으로 다시 확인한다
    return approveTranslationRows(project.dir, language, rows, masterByKey, (current) => {
      const row = masterByKey.get(current.key)
      const diagnostics = row ? checkRow(toQaInput(row, current), ctx) : []
      return bulkApproveBlocker(
        { status: current.status, translation: current.text, confidence: current.confidence, diagnostics },
        lowConfidence
      )
    })
  })

  ipcMain.handle(IPC.rowReroll, async (event, raw: unknown): Promise<IpcResult<RerollCandidate>> => {
    const parsed = RerollInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '재번역 요청 형식이 올바르지 않습니다.', parsed.error.message)
    const project = currentProject()
    if (!project) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')
    const { cliPath, claudeConfigDir } = loadAppSettings()
    const sender = event.sender
    // 재번역 로그는 번역 작업 로그와 같은 곳(번역 화면·에이전트 패널)에 남긴다
    const log = (entry: Omit<JobLogEntry, 'at'>): void => {
      const payload: JobLogEntry = { at: new Date().toISOString(), ...entry }
      send(sender, IPC_EVENT.jobLog, payload)
    }
    return runReroll(project, parsed.data, { cliPath, configDir: claudeConfigDir }, log)
  })

  ipcMain.handle(IPC.rowRerollCancel, (_event, raw: unknown): IpcResult<boolean> => {
    const parsed = RerollCancelInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '취소 요청 형식이 올바르지 않습니다.')
    return ok(cancelReroll(parsed.data.requestId))
  })
}
