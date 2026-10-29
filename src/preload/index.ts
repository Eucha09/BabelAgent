import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import type {
  AuthLoginDone,
  AuthLoginInput,
  AuthLoginOutput,
  AuthStatus,
  AgentChatCancelInput,
  AgentChatDelta,
  AgentChatEnd,
  AgentChatError,
  AgentChatSendInput,
  AgentCheckResult,
  ChatRuleProposal
} from '@shared/schema/agent'
import type { AppSettings, AppSettingsPatch } from '@shared/schema/app-settings'
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
    loginStart: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.authLoginStart),
    loginInput: (input: AuthLoginInput): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC.authLoginInput, input),
    loginCancel: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IPC.authLoginCancel),
    logout: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.authLogout),
    onLoginOutput: (listener: (payload: AuthLoginOutput) => void): (() => void) =>
      subscribe(IPC_EVENT.authLoginOutput, listener),
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
