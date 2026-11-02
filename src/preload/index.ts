import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import type {
  AuthLoginDone,
  AuthStatus,
  AgentChatCancelInput,
  AgentChatDelta,
  AgentChatEnd,
  AgentChatError,
  AgentChatSendInput,
  AgentCheckResult,
  ChatRuleProposal,
  LoginMethod
} from '@shared/schema/agent'
import type { AppSettings, AppSettingsPatch } from '@shared/schema/app-settings'
import type { AppUpdateStatus } from '@shared/schema/app-update'
import type { ClaudeCliStatus, ClaudeInstallDone, ClaudeUpdateResult } from '@shared/schema/cli'
import type {
  ApplyStyleRuleResult,
  CreateProjectInput,
  OpenProject,
  ProjectSettingsPatch,
  StyleRuleChange
} from '@shared/schema/project'
import type { ApplyContextInput, ApplyContextResult, ContextView, StartContextInput } from '@shared/schema/context'
import type { ExportPreview, ExportRequest, ExportResult } from '@shared/schema/export'
import type {
  AddTermInput,
  AddTermResult,
  RetranslateTermInput,
  RetranslateTermResult,
  GlossaryView,
  StartTermsInput,
  StartTermTranslateInput,
  UpdateGlossaryInput,
  UpdateGlossaryResult
} from '@shared/schema/glossary'
import type {
  FileChanged,
  ImportInput,
  ImportPreview,
  ImportSummary,
  SaveStringsInput,
  SaveStringsResult,
  StringsView
} from '@shared/schema/strings'
import type { UsageLimits } from '@shared/schema/usage'
import type { QaReport } from '@shared/schema/qa'
import type {
  BulkApproveInput,
  BulkApproveResult,
  RerollCandidate,
  RerollInput,
  UpdateTranslationInput,
  UpdateTranslationResult
} from '@shared/schema/review'
import type {
  ChatToolCall,
  DataWritten,
  JobControlInput,
  JobLogEntry,
  JobView,
  StartTranslateInput
} from '@shared/schema/jobs'
import type { IpcResult } from '@shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

const api = {
  settings: {
    get: (): Promise<IpcResult<AppSettings>> => ipcRenderer.invoke(IPC.appSettingsGet),
    set: (patch: AppSettingsPatch): Promise<IpcResult<AppSettings>> =>
      ipcRenderer.invoke(IPC.appSettingsSet, patch)
  },
  project: {
    pick: (): Promise<IpcResult<string>> => ipcRenderer.invoke(IPC.projectPick),
    create: (input: CreateProjectInput): Promise<IpcResult<OpenProject>> =>
      ipcRenderer.invoke(IPC.projectCreate, input),
    open: (dir: string): Promise<IpcResult<OpenProject>> =>
      ipcRenderer.invoke(IPC.projectOpen, { dir }),
    close: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.projectClose),
    /** project.json 의 화면 설정(프로젝트·번역·설정 화면)을 고친다 */
    setSettings: (patch: ProjectSettingsPatch): Promise<IpcResult<OpenProject>> =>
      ipcRenderer.invoke(IPC.projectSettingsSet, patch),
    /** 에이전트 패널의 규칙 카드에서 [저장]을 눌렀을 때 */
    applyRule: (change: StyleRuleChange): Promise<IpcResult<ApplyStyleRuleResult>> =>
      ipcRenderer.invoke(IPC.projectRuleApply, { change }),
    /** 작업이나 패널 도구가 프로젝트 파일(용어집·컨텍스트 제안)을 썼을 때 */
    onDataWritten: (listener: (payload: DataWritten) => void): (() => void) =>
      subscribe(IPC_EVENT.dataWritten, listener),
    /** project.json 이 앱 밖에서 바뀌어 메인이 다시 읽었을 때 */
    onChanged: (listener: (project: OpenProject) => void): (() => void) =>
      subscribe(IPC_EVENT.projectChanged, listener)
  },
  strings: {
    list: (language: string | null): Promise<IpcResult<StringsView>> =>
      ipcRenderer.invoke(IPC.stringsList, { language }),
    save: (input: SaveStringsInput): Promise<IpcResult<SaveStringsResult>> =>
      ipcRenderer.invoke(IPC.stringsSave, input),
    create: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.stringsCreate),
    importPreview: (): Promise<IpcResult<ImportPreview>> =>
      ipcRenderer.invoke(IPC.stringsImportPreview),
    import: (input: ImportInput): Promise<IpcResult<ImportSummary>> =>
      ipcRenderer.invoke(IPC.stringsImport, input),
    onFileChanged: (listener: (payload: FileChanged) => void): (() => void) =>
      subscribe(IPC_EVENT.fileChanged, listener)
  },
  glossary: {
    list: (): Promise<IpcResult<GlossaryView>> => ipcRenderer.invoke(IPC.glossaryList),
    update: (input: UpdateGlossaryInput): Promise<IpcResult<UpdateGlossaryResult>> =>
      ipcRenderer.invoke(IPC.glossaryUpdate, input),
    extract: (input: StartTermsInput): Promise<IpcResult<JobView>> => ipcRenderer.invoke(IPC.glossaryExtract, input),
    /** 용어 번역 작업. 고른 언어의 빈 칸만 채운다 */
    translate: (input: StartTermTranslateInput): Promise<IpcResult<JobView>> => ipcRenderer.invoke(IPC.glossaryTranslate, input),
    /** 용어 하나를 에이전트로 채워 승인 대기로 추가한다 */
    add: (input: AddTermInput): Promise<IpcResult<AddTermResult>> => ipcRenderer.invoke(IPC.glossaryAdd, input),
    /** 용어 하나를 다시 번역한다. 결과는 쓰지 않고 돌려준다 */
    retranslate: (input: RetranslateTermInput): Promise<IpcResult<RetranslateTermResult>> =>
      ipcRenderer.invoke(IPC.glossaryRetranslate, input),
    /** 용어 추가·재번역 세션 취소 */
    cancelAgent: (requestId: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IPC.glossaryAgentCancel, { requestId })
  },
  context: {
    list: (): Promise<IpcResult<ContextView>> => ipcRenderer.invoke(IPC.contextList),
    estimate: (input: StartContextInput): Promise<IpcResult<JobView>> => ipcRenderer.invoke(IPC.contextEstimate, input),
    apply: (input: ApplyContextInput): Promise<IpcResult<ApplyContextResult>> => ipcRenderer.invoke(IPC.contextApply, input),
    discard: (keys: string[]): Promise<IpcResult<number>> => ipcRenderer.invoke(IPC.contextDiscard, { keys })
  },
  auth: {
    status: (): Promise<IpcResult<AuthStatus>> => ipcRenderer.invoke(IPC.authStatus),
    /** Claude Code 가 자기 창에서 로그인을 진행한다. 창이 닫히면 onLoginDone */
    loginStart: (method: LoginMethod): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.authLoginStart, { method }),
    /** 열어 둔 로그인 창을 닫는다 */
    loginCancel: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IPC.authLoginCancel),
    logout: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.authLogout),
    onLoginDone: (listener: (payload: AuthLoginDone) => void): (() => void) =>
      subscribe(IPC_EVENT.authLoginDone, listener)
  },
  jobs: {
    start: (input: StartTranslateInput): Promise<IpcResult<JobView>> => ipcRenderer.invoke(IPC.jobStart, input),
    control: (action: JobControlInput['action']): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC.jobControl, { action }),
    current: (): Promise<JobView | null> => ipcRenderer.invoke(IPC.jobCurrent),
    onUpdate: (listener: (view: JobView) => void): (() => void) => subscribe(IPC_EVENT.jobUpdate, listener),
    onLog: (listener: (entry: JobLogEntry) => void): (() => void) => subscribe(IPC_EVENT.jobLog, listener)
  },
  review: {
    runQa: (language: string): Promise<IpcResult<QaReport>> => ipcRenderer.invoke(IPC.qaRun, { language }),
    update: (input: UpdateTranslationInput): Promise<IpcResult<UpdateTranslationResult>> =>
      ipcRenderer.invoke(IPC.translationUpdate, input),
    approveMany: (input: BulkApproveInput): Promise<IpcResult<BulkApproveResult>> =>
      ipcRenderer.invoke(IPC.translationApprove, input),
    reroll: (input: RerollInput): Promise<IpcResult<RerollCandidate>> => ipcRenderer.invoke(IPC.rowReroll, input),
    cancelReroll: (requestId: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC.rowRerollCancel, { requestId })
  },
  export: {
    /** 헤더·QA·Smart 항목·요약 미리보기. 쓰지 않는다 */
    preview: (request: ExportRequest): Promise<IpcResult<ExportPreview>> => ipcRenderer.invoke(IPC.exportPreview, request),
    /** 다시 검사한 뒤 export/ 에 쓴다. 덮어쓸 파일이 있으면 overwrite 를 확인받아 true 로 */
    run: (request: ExportRequest, overwrite: boolean): Promise<IpcResult<ExportResult>> =>
      ipcRenderer.invoke(IPC.exportRun, { request, overwrite }),
    reveal: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.exportReveal),
    /** Unity 프로젝트 폴더를 대화상자로 골라 연결한다(읽기 전용) */
    linkUnity: (): Promise<IpcResult<OpenProject>> => ipcRenderer.invoke(IPC.exportUnityLink),
    unlinkUnity: (): Promise<IpcResult<OpenProject>> => ipcRenderer.invoke(IPC.exportUnityUnlink),
    reloadUnity: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.exportUnityReload),
    selectCollection: (tableCollection: string): Promise<IpcResult<OpenProject>> =>
      ipcRenderer.invoke(IPC.exportUnityCollection, { tableCollection }),
    /** Unity 에서 내보낸 샘플 CSV 를 대화상자로 골라 템플릿으로 등록한다 */
    setTemplate: (): Promise<IpcResult<OpenProject>> => ipcRenderer.invoke(IPC.exportTemplateSet),
    clearTemplate: (): Promise<IpcResult<OpenProject>> => ipcRenderer.invoke(IPC.exportTemplateClear)
  },
  cli: {
    /** 앱이 쓰는 Claude Code 실행 파일과 버전 */
    status: (): Promise<IpcResult<ClaudeCliStatus>> => ipcRenderer.invoke(IPC.cliStatus),
    /** claude update 를 돌리고 앞뒤 버전을 돌려준다 */
    update: (): Promise<IpcResult<ClaudeUpdateResult>> => ipcRenderer.invoke(IPC.cliUpdate),
    /** 공식 설치 스크립트를 보이는 콘솔 창에서 돌린다. 창이 닫히면 onInstallDone */
    install: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.cliInstall),
    cancelInstall: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IPC.cliInstallCancel),
    onInstallDone: (listener: (payload: ClaudeInstallDone) => void): (() => void) =>
      subscribe(IPC_EVENT.cliInstallDone, listener)
  },
  appUpdate: {
    /** 지금 버전과 업데이트 상태 */
    status: (): Promise<IpcResult<AppUpdateStatus>> => ipcRenderer.invoke(IPC.appUpdateStatus),
    /** GitHub Releases 에서 새 버전을 확인한다. 확인이 끝난 상태를 돌려준다 */
    check: (): Promise<IpcResult<AppUpdateStatus>> => ipcRenderer.invoke(IPC.appUpdateCheck),
    /** 찾은 새 버전을 받기 시작한다. 진행률은 onState */
    download: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.appUpdateDownload),
    cancel: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IPC.appUpdateCancel),
    /** 받아 둔 업데이트를 설치한다. 앱이 닫히고 설치가 끝나면 다시 열린다 */
    install: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.appUpdateInstall),
    onState: (listener: (payload: AppUpdateStatus) => void): (() => void) =>
      subscribe(IPC_EVENT.appUpdateState, listener)
  },
  usage: {
    read: (): Promise<IpcResult<UsageLimits>> => ipcRenderer.invoke(IPC.usageRead)
  },
  agent: {
    check: (): Promise<AgentCheckResult> => ipcRenderer.invoke(IPC.agentCheck),
    send: (input: AgentChatSendInput): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC.agentChatSend, input),
    cancel: (input: AgentChatCancelInput): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC.agentChatCancel, input),
    onDelta: (listener: (payload: AgentChatDelta) => void): (() => void) =>
      subscribe(IPC_EVENT.agentChatDelta, listener),
    onEnd: (listener: (payload: AgentChatEnd) => void): (() => void) =>
      subscribe(IPC_EVENT.agentChatEnd, listener),
    onError: (listener: (payload: AgentChatError) => void): (() => void) =>
      subscribe(IPC_EVENT.agentChatError, listener),
    onTool: (listener: (payload: ChatToolCall) => void): (() => void) =>
      subscribe(IPC_EVENT.agentChatTool, listener),
    onRule: (listener: (payload: ChatRuleProposal) => void): (() => void) =>
      subscribe(IPC_EVENT.agentChatRule, listener)
  }
} as const

export type BabelApi = typeof api

contextBridge.exposeInMainWorld('babel', api)
