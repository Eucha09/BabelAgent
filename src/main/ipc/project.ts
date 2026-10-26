import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import { applyStyleRuleChange } from '@core/project/rules'
import { applySettingsPatch, settingsChanged, validateProjectSettings } from '@core/project/settings'
import {
  ApplyStyleRuleInput,
  type ApplyStyleRuleResult,
  CreateProjectInput,
  OpenProjectInput,
  ProjectConfig,
  ProjectSettingsPatch,
  type OpenProject
} from '@shared/schema/project'
import { fail, ok, type IpcResult } from '@shared/types'
import { createProject, openProject, saveProjectConfig } from '../project/open'
import { cancelActiveJob } from '../jobs/runner'
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
 * project.json 이 앱 밖에서 바뀌면 다시 읽어 메인 설정과 화면을 맞춘다. 바뀌었으면 true.
 * 읽기에 실패하면(저장 도중이거나 잘못 고친 경우) 이전 설정을 그대로 둔다.
 * 앱이 방금 쓴 내용(번역 설정 저장 등)은 지금 설정과 같으므로 바뀐 것으로 보지 않는다.
 */
function reloadConfig(dir: string, sender: WebContents): boolean {
  if (!current || current.dir !== dir) return false
  const result = openProject(dir)
  if (!result.ok) return false
  // 스키마로 한 번 더 통과시켜 키 순서를 맞춘 뒤 비교한다
  if (JSON.stringify(ProjectConfig.parse(current.config)) === JSON.stringify(result.value.config)) return false
  current = result.value
  if (!sender.isDestroyed()) sender.send(IPC_EVENT.projectChanged, result.value)
  return true
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

  /**
   * 화면(프로젝트·번역·설정)에서 고친 project.json 항목을 저장한다. 바뀐 묶음만 받아 지금 설정에 합치므로
   * 그 사이 앱 밖에서 고친 다른 묶음은 남는다. 같은 값이면 쓰지 않는다.
   */
  ipcMain.handle(IPC.projectSettingsSet, (_event, raw: unknown): IpcResult<OpenProject> => {
    const parsed = ProjectSettingsPatch.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '설정 형식이 올바르지 않습니다.', parsed.error.message)
    if (!current) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')

    const next = ProjectConfig.safeParse(applySettingsPatch(current.config, parsed.data))
    if (!next.success) return fail('invalid-input', '설정 값이 올바르지 않습니다.', next.error.message)
    const problems = validateProjectSettings(next.data)
    if (problems.length > 0) {
      return fail('invalid-input', '설정에 고칠 곳이 있어 저장하지 않았습니다.', problems.map((problem) => problem.message).join('\n'))
    }
    if (!settingsChanged(current.config, next.data)) return ok(current)

    const saved = saveProjectConfig(current.dir, next.data)
    if (!saved.ok) return saved
    current = { ...current, config: next.data }
    return ok(current)
  })

  /**
   * 에이전트 패널의 규칙 카드에서 [저장]을 눌렀을 때. 제안된 뒤 규칙이 바뀌었을 수 있으므로
   * 지금 설정에 다시 적용해 보고, 통과하면 같은 검증을 거쳐 project.json 에 쓴다.
   */
  ipcMain.handle(IPC.projectRuleApply, (_event, raw: unknown): IpcResult<ApplyStyleRuleResult> => {
    const parsed = ApplyStyleRuleInput.safeParse(raw)
    if (!parsed.success) return fail('invalid-input', '규칙 저장 요청 형식이 올바르지 않습니다.', parsed.error.message)
    if (!current) return fail('not-a-project', '프로젝트를 먼저 열어야 합니다.')

    const applied = applyStyleRuleChange(current.config.styleRules, parsed.data.change, new Date().toISOString())
    if (!applied.ok) return fail('invalid-input', applied.problem.message)
    const next = { ...current.config, styleRules: applied.rules }
    const problems = validateProjectSettings(next)
    if (problems.length > 0) {
      return fail('invalid-input', '설정에 고칠 곳이 있어 저장하지 않았습니다.', problems.map((problem) => problem.message).join('\n'))
    }
    const saved = saveProjectConfig(current.dir, next)
    if (!saved.ok) return saved
    current = { ...current, config: next }
    return ok({ project: current, ruleId: applied.ruleId })
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
