import { basename } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { parseCsvTable, toRecords } from '@core/csv/codec'
import { guessMapping, importMaster } from '@core/strings/import'
import { IPC } from '@shared/ipc'
import {
  ImportInput,
  SaveStringsInput,
  StringsListInput,
  type ImportPreview,
  type ImportSummary,
  type StringsView
} from '@shared/schema/strings'
import type { OpenProject } from '@shared/schema/project'
import { fail, ok, type IpcResult } from '@shared/types'
import { describeIoError } from '../fs'
import { readTextFile } from '../fs/text'
import { joinRows, loadMaster, loadTranslations, saveMaster } from '../project/store'
import { currentProject } from './project'

const SAMPLE_ROWS = 5

function requireProject(): IpcResult<OpenProject> {
  const project = currentProject()
  if (!project) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')
  return ok(project)
}

/** 대상 언어가 지정되지 않으면 첫 번째 대상 언어를 본다. */
function resolveLanguage(project: OpenProject, requested: string | null): string | null {
  const languages = project.config.targetLanguages
  if (requested && languages.includes(requested)) return requested
  return languages[0] ?? null
}

export function registerStringsIpc(): void {
  ipcMain.handle(IPC.stringsList, (_event, raw: unknown): IpcResult<StringsView> => {
    const parsed = StringsListInput.safeParse(raw)
    if (!parsed.success) return fail('unknown', '요청 형식이 올바르지 않습니다.')
    const found = requireProject()
    if (!found.ok) return found
    const project = found.value

    const master = loadMaster(project.dir)
    if (!master.ok) return master

    const language = resolveLanguage(project, parsed.data.language)
    const translations = language ? loadTranslations(project.dir, language) : null
    if (translations && !translations.ok) return translations

    const notices = [master.value.notice, translations?.ok ? translations.value.notice : null].filter(
      (notice) => notice !== null
    )

    return ok({
      rows: joinRows(master.value.rows, translations?.ok ? translations.value.rows : []),
      language,
      languages: project.config.targetLanguages,
      notices
    })
  })

  ipcMain.handle(IPC.stringsSave, (_event, raw: unknown): IpcResult<{ staleMarked: number }> => {
    const parsed = SaveStringsInput.safeParse(raw)
    if (!parsed.success) return fail('unknown', '저장 요청 형식이 올바르지 않습니다.')
    const found = requireProject()
    if (!found.ok) return found

    const result = saveMaster(
      found.value.dir,
      found.value.config,
      parsed.data.rows,
      parsed.data.force
    )
    if (!result.ok) return result
    return ok({ staleMarked: result.value.staleMarked })
  })

  ipcMain.handle(IPC.stringsImportPreview, async (event): Promise<IpcResult<ImportPreview>> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const picked = await (window
      ? dialog.showOpenDialog(window, {
          title: '가져올 원문 CSV 선택',
          properties: ['openFile'],
          filters: [{ name: 'CSV', extensions: ['csv'] }]
        })
      : dialog.showOpenDialog({ properties: ['openFile'] }))

    const filePath = picked.filePaths[0]
    if (picked.canceled || !filePath) return fail('cancelled', '파일 선택을 취소했습니다.')

    try {
      const file = readTextFile(filePath)
      const table = parseCsvTable(file.text)
      if (table.header.length === 0) {
        return fail('invalid-project', '헤더를 읽을 수 없는 CSV입니다.', basename(filePath))
      }
      return ok({
        filePath,
        header: table.header,
        sample: table.rows.slice(0, SAMPLE_ROWS),
        encoding: file.encoding,
        guess: guessMapping(table.header)
      })
    } catch (error) {
      return fail('io', describeIoError(error, basename(filePath)))
    }
  })

  ipcMain.handle(IPC.stringsImport, (_event, raw: unknown): IpcResult<ImportSummary> => {
    const parsed = ImportInput.safeParse(raw)
    if (!parsed.success) return fail('unknown', '가져오기 요청 형식이 올바르지 않습니다.')
    const found = requireProject()
    if (!found.ok) return found
    const project = found.value
    const { filePath, mapping, force } = parsed.data

    const master = loadMaster(project.dir)
    if (!master.ok) return master

    let incoming: Record<string, string>[]
    try {
      const file = readTextFile(filePath)
      incoming = toRecords(parseCsvTable(file.text))
    } catch (error) {
      return fail('io', describeIoError(error, basename(filePath)))
    }

    const merged = importMaster(master.value.rows, incoming, mapping)
    const saved = saveMaster(project.dir, project.config, merged.rows, force)
    if (!saved.ok) return saved

    return ok({ ...merged.summary, staleMarked: saved.value.staleMarked })
  })
}
