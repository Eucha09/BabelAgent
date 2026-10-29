import { existsSync, mkdirSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions, type WebContents } from 'electron'
import { parseCsvTable, stringifyCsvTable } from '@core/csv/codec'
import { inferTemplateColumns } from '@core/export/header'
import { resolveLocales } from '@core/export/locales'
import { glyphsByLanguage, planExport, smartTable, type ExportPlan, type TemplateReadResult, type UnityScanResult } from '@core/export/plan'
import { uniqueLocales } from '@core/export/unity-yaml'
import { checkRow, hasErrors } from '@core/qa/check'
import { IPC } from '@shared/ipc'
import {
  ExportRequest,
  ExportRunInput,
  SelectCollectionInput,
  type ExportPreview,
  type ExportQaItem,
  type ExportResult
} from '@shared/schema/export'
import type { OpenProject, ProjectConfig } from '@shared/schema/project'
import type { TranslationRow } from '@shared/schema/strings'
import { fail, ok, type IpcResult } from '@shared/types'
import { describeIoError } from '../fs'
import { readTextFile, writeTextFile } from '../fs/text'
import { checkUnityProject, resolveUnityPath, scanUnityProject, toStoredUnityPath } from '../export/unity-project'
import { saveProjectConfig } from '../project/open'
import { loadQaContext, toQaInput } from '../project/qa'
import { loadMaster, loadTranslations } from '../project/store'
import { currentProject, replaceCurrentConfig } from './project'

/** 출력 폴더(프로젝트 폴더 기준) */
const OUTPUT_DIR = 'export'
/** 템플릿을 복사해 두는 자리(프로젝트 폴더 기준) */
const TEMPLATE_FILE = 'templates/unity_template.csv'
/** 미리보기에 보여 줄 출력 행 수 */
const SAMPLE_ROWS = 5
/** 진단 목록에 담는 오류 수. 나머지는 개수로만 알린다 */
const QA_ERROR_LIMIT = 200

/** Unity 프로젝트를 읽은 결과. 미리보기마다 다시 훑지 않고 [다시 읽기]·연결할 때만 읽는다. */
let unityCache: { dir: string; result: UnityScanResult } | null = null

/** 프로젝트 폴더 안의 상대 경로만 받는다. 밖이면 null. */
function insideProject(projectDir: string, relPath: string): string | null {
  const full = resolve(projectDir, relPath)
  const rel = relative(projectDir, full)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return full
}

async function unityScan(project: OpenProject, refresh: boolean): Promise<UnityScanResult> {
  const link = project.config.export.unity
  if (!link) return { state: 'none' }
  const dir = resolveUnityPath(project.dir, link.projectPath)
  if (!refresh && unityCache?.dir === dir) return unityCache.result
  const result = await scanUnityProject(dir, link.projectPath)
  unityCache = { dir, result }
  return result
}

function readTemplate(project: OpenProject): TemplateReadResult {
  const template = project.config.export.template
  if (!template) return { state: 'none' }
  const path = insideProject(project.dir, template.path)
  if (path === null) return { state: 'failed', path: template.path, reason: '프로젝트 폴더 밖의 경로입니다. 템플릿을 다시 등록하세요.' }
  if (!existsSync(path)) return { state: 'failed', path: template.path, reason: '파일이 없습니다. 템플릿을 다시 등록하세요.' }
  try {
    const header = parseCsvTable(readTextFile(path).text).header
    if (header.length === 0) return { state: 'failed', path: template.path, reason: '헤더(첫 줄)를 읽지 못했습니다.' }
    return { state: 'ok', path: template.path, header }
  } catch (error) {
    return { state: 'failed', path: template.path, reason: describeIoError(error, template.path) }
  }
}

type Gathered = { plan: ExportPlan; qaErrors: ExportQaItem[]; qaErrorCount: number; qaWarnings: number; qaNotices: string[] }

/** 원문·번역·Unity·템플릿을 읽어 내보내기 계획과 QA 결과를 만든다. 미리보기와 쓰기가 같이 쓴다. */
async function gather(project: OpenProject, request: ExportRequest): Promise<IpcResult<Gathered>> {
  const { config } = project
  const master = loadMaster(project.dir)
  if (!master.ok) return master

  const translations = new Map<string, Map<string, TranslationRow>>()
  for (const language of config.targetLanguages) {
    if (!request.languages.includes(language)) continue
    const loaded = loadTranslations(project.dir, language)
    if (!loaded.ok) return loaded
    translations.set(language, new Map(loaded.value.rows.map((row) => [row.key, row])))
  }

  const plan = planExport({
    config,
    request,
    master: master.value.rows,
    translations,
    unity: await unityScan(project, false),
    template: readTemplate(project)
  })

  // QA: 번역문을 그대로 내보내는 칸만 본다. 비우거나 원문으로 채우는 칸의 옛 번역은 Unity 로 가지 않는다
  const byKey = new Map(master.value.rows.map((row) => [row.key, row]))
  const qaErrors: ExportQaItem[] = []
  const qaNotices: string[] = []
  let qaErrorCount = 0
  let qaWarnings = 0
  for (const [language, keys] of plan.build.exportedCells) {
    const { ctx, notices } = loadQaContext(project, language)
    qaNotices.push(...notices)
    const rows = translations.get(language)
    for (const key of keys) {
      const row = byKey.get(key)
      if (!row) continue
      const diagnostics = checkRow(toQaInput(row, rows?.get(key)), ctx)
      if (!hasErrors(diagnostics)) {
        qaWarnings += diagnostics.length
        continue
      }
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === 'warning') {
          qaWarnings += 1
          continue
        }
        qaErrorCount += 1
        if (qaErrors.length < QA_ERROR_LIMIT) qaErrors.push({ language, key, ruleId: diagnostic.ruleId, message: diagnostic.message })
      }
    }
  }
  if (qaErrorCount > qaErrors.length) qaNotices.push(`QA 오류 ${qaErrorCount}개 중 앞의 ${qaErrors.length}개만 보여 줍니다.`)

  return ok({ plan, qaErrors, qaErrorCount, qaWarnings, qaNotices: [...new Set(qaNotices)] })
}

function toPreview(project: OpenProject, gathered: Gathered): ExportPreview {
  const { plan } = gathered
  const outputDir = join(project.dir, OUTPUT_DIR)
  return {
    headerSource: plan.headerSource,
    columns: plan.columns,
    sampleRows: plan.build.rows.slice(0, SAMPLE_ROWS),
    languages: plan.languages,
    unity: plan.unity,
    template: plan.template,
    problems: plan.problems,
    warnings: plan.warnings,
    qaErrors: gathered.qaErrors,
    qaWarnings: gathered.qaWarnings,
    qaNotices: gathered.qaNotices,
    summary: plan.build.summary,
    smart: plan.smart,
    smartUnset: plan.smartUnset,
    outputDir: OUTPUT_DIR,
    files: plan.files.map((name) => ({ name, exists: existsSync(join(outputDir, name)) })),
    blocked: plan.problems.length > 0 || gathered.qaErrorCount > 0
  }
}

/** 메인이 project.json 을 고치고 들고 있는 설정도 맞춘다 */
function saveConfig(project: OpenProject, config: ProjectConfig): IpcResult<OpenProject> {
  const saved = saveProjectConfig(project.dir, config)
  if (!saved.ok) return saved
  replaceCurrentConfig(config)
  return ok({ ...project, config })
}

async function pick(sender: WebContents, options: OpenDialogOptions): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(sender)
  const result = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
  const path = result.filePaths[0]
  return result.canceled || !path ? null : path
}

const noProject = <T>(): IpcResult<T> => fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')

export function registerExportIpc(): void {
  ipcMain.handle(IPC.exportPreview, async (_event, raw: unknown): Promise<IpcResult<ExportPreview>> => {
    const parsed = ExportRequest.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '내보내기 요청 형식이 올바르지 않습니다.', parsed.error.message)
    const project = currentProject()
    if (!project) return noProject()
    const gathered = await gather(project, parsed.data)
    if (!gathered.ok) return gathered
    return ok(toPreview(project, gathered.value))
  })

  /** 쓰기 직전에 다시 읽고 다시 검사한다. 막는 문제가 있거나, 덮어쓸 파일을 확인받지 않았으면 쓰지 않는다. */
  ipcMain.handle(IPC.exportRun, async (_event, raw: unknown): Promise<IpcResult<ExportResult>> => {
    const parsed = ExportRunInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '내보내기 요청 형식이 올바르지 않습니다.', parsed.error.message)
    const project = currentProject()
    if (!project) return noProject()
    const gathered = await gather(project, parsed.data.request)
    if (!gathered.ok) return gathered
    const { plan, qaErrorCount } = gathered.value
    if (plan.problems.length > 0) return fail('invalid-input', '내보내기를 막는 문제가 있습니다.', plan.problems.join('\n'))
    if (qaErrorCount > 0) return fail('invalid-input', `QA 오류 ${qaErrorCount}개가 있어 내보내지 않았습니다. 진단 목록에서 고치세요.`)

    const outputDir = join(project.dir, OUTPUT_DIR)
    const existing = plan.files.filter((name) => existsSync(join(outputDir, name)))
    if (existing.length > 0 && !parsed.data.overwrite) {
      return fail('conflict', '이미 있는 파일을 덮어써야 합니다.', existing.join('\n'))
    }

    const contents = new Map<string, string>()
    contents.set(plan.mainFile, stringifyCsvTable({ header: plan.build.header, rows: plan.build.rows }))
    if (plan.smartFile) contents.set(plan.smartFile, stringifyCsvTable(smartTable(plan.smart)))
    if (plan.glyphFiles.length > 0) {
      const glyphs = glyphsByLanguage(plan, project.config.smartStrings)
      for (const file of plan.glyphFiles) contents.set(file.name, glyphs.get(file.language) ?? '')
    }

    try {
      mkdirSync(outputDir, { recursive: true })
    } catch (error) {
      return fail('io', describeIoError(error, OUTPUT_DIR))
    }
    const written: string[] = []
    for (const name of plan.files) {
      const text = contents.get(name)
      if (text === undefined) continue
      try {
        writeTextFile(join(outputDir, name), text)
        written.push(name)
      } catch (error) {
        const done = written.length > 0 ? ` 이미 쓴 파일: ${written.join(', ')}` : ''
        return fail('io', describeIoError(error, `${OUTPUT_DIR}/${name}`), `파일마다 따로 교체하므로 쓴 파일은 온전합니다.${done}`)
      }
    }
    return ok({ outputDir: OUTPUT_DIR, files: written, summary: plan.build.summary, smartCount: plan.smart.length })
  })

  ipcMain.handle(IPC.exportReveal, async (): Promise<IpcResult<null>> => {
    const project = currentProject()
    if (!project) return noProject()
    const dir = join(project.dir, OUTPUT_DIR)
    if (!existsSync(dir)) return fail('io', `${OUTPUT_DIR} 폴더가 아직 없습니다. 먼저 내보내세요.`)
    const error = await shell.openPath(dir)
    return error === '' ? ok(null) : fail('io', `폴더를 열지 못했습니다: ${error}`)
  })

  /** Unity 프로젝트 폴더를 고른다. 대화상자로만 정하고, 읽기만 한다. */
  ipcMain.handle(IPC.exportUnityLink, async (event): Promise<IpcResult<OpenProject>> => {
    const project = currentProject()
    if (!project) return noProject()
    const dir = await pick(event.sender, { title: 'Unity 프로젝트 폴더 선택', properties: ['openDirectory'], buttonLabel: '연결' })
    if (dir === null) return fail('cancelled', '폴더 선택을 취소했습니다.')
    const problem = checkUnityProject(dir)
    if (problem !== null) return fail('invalid-input', `Unity 프로젝트 폴더가 아닙니다: ${problem}`, dir)

    const projectPath = toStoredUnityPath(project.dir, dir)
    const previous = project.config.export.unity
    const tableCollection = previous && resolveUnityPath(project.dir, previous.projectPath) === resolve(dir) ? previous.tableCollection : ''
    unityCache = null
    return saveConfig(project, { ...project.config, export: { ...project.config.export, unity: { projectPath, tableCollection } } })
  })

  ipcMain.handle(IPC.exportUnityUnlink, (): IpcResult<OpenProject> => {
    const project = currentProject()
    if (!project) return noProject()
    unityCache = null
    return saveConfig(project, { ...project.config, export: { ...project.config.export, unity: null } })
  })

  /** 연결한 Unity 프로젝트를 다시 훑는다(Unity 에서 키·로케일을 바꾼 뒤). */
  ipcMain.handle(IPC.exportUnityReload, async (): Promise<IpcResult<null>> => {
    const project = currentProject()
    if (!project) return noProject()
    await unityScan(project, true)
    return ok(null)
  })

  ipcMain.handle(IPC.exportUnityCollection, (_event, raw: unknown): IpcResult<OpenProject> => {
    const parsed = SelectCollectionInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '컬렉션 선택 형식이 올바르지 않습니다.', parsed.error.message)
    const project = currentProject()
    if (!project) return noProject()
    const link = project.config.export.unity
    if (!link) return fail('invalid-input', 'Unity 프로젝트를 먼저 연결하세요.')
    return saveConfig(project, {
      ...project.config,
      export: { ...project.config.export, unity: { ...link, tableCollection: parsed.data.tableCollection } }
    })
  })

  /**
   * Unity 에서 내보낸 샘플 CSV 를 템플릿으로 등록한다. 프로젝트 폴더 밖의 파일은 templates/ 로 복사해
   * 프로젝트가 스스로 템플릿을 갖게 한다. 열 역할은 지금 언어 설정으로 추론해 저장한다.
   */
  ipcMain.handle(IPC.exportTemplateSet, async (event): Promise<IpcResult<OpenProject>> => {
    const project = currentProject()
    if (!project) return noProject()
    const file = await pick(event.sender, {
      title: 'Unity 에서 내보낸 CSV 선택',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      buttonLabel: '등록'
    })
    if (file === null) return fail('cancelled', '파일 선택을 취소했습니다.')

    let text: string
    try {
      text = readTextFile(file).text
    } catch (error) {
      return fail('io', describeIoError(error, basename(file)))
    }
    const header = parseCsvTable(text).header
    if (header.length === 0) return fail('invalid-input', '헤더(첫 줄)를 읽지 못했습니다. Unity 에서 내보낸 CSV 인지 확인하세요.')

    const inside = relative(project.dir, file)
    let path = inside.split('\\').join('/')
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
      path = TEMPLATE_FILE
      const target = join(project.dir, TEMPLATE_FILE)
      try {
        mkdirSync(join(project.dir, 'templates'), { recursive: true })
        writeTextFile(target, text)
      } catch (error) {
        return fail('io', describeIoError(error, TEMPLATE_FILE))
      }
    }

    const { config } = project
    const scan = await unityScan(project, false)
    const unityLocales = scan.state === 'ok' ? uniqueLocales(scan.locales) : null
    const { locales } = resolveLocales([config.sourceLanguage, ...config.targetLanguages], config.sourceLanguage, config.export.locales, unityLocales)
    const columns = inferTemplateColumns(header, locales)
    return saveConfig(project, { ...config, export: { ...config.export, template: { path, columns } } })
  })

  /** 템플릿 등록을 푼다. 복사해 둔 파일은 지우지 않는다. */
  ipcMain.handle(IPC.exportTemplateClear, (): IpcResult<OpenProject> => {
    const project = currentProject()
    if (!project) return noProject()
    return saveConfig(project, { ...project.config, export: { ...project.config.export, template: null } })
  })
}
