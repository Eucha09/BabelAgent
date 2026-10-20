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
  AgentCheckResult
} from '@shared/schema/agent'
import type { AppSettings, AppSettingsPatch } from '@shared/schema/app-settings'
import type { CreateProjectInput, OpenProject } from '@shared/schema/project'
import type {
  FileChanged,
  ImportInput,
  ImportPreview,
  ImportSummary,
  SaveStringsInput,
  StringsView
} from '@shared/schema/strings'
import type { UsageLimits } from '@shared/schema/usage'
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
    close: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC.projectClose)
  },
  strings: {
    list: (language: string | null): Promise<IpcResult<StringsView>> =>
      ipcRenderer.invoke(IPC.stringsList, { language }),
    save: (input: SaveStringsInput): Promise<IpcResult<{ staleMarked: number }>> =>
      ipcRenderer.invoke(IPC.stringsSave, input),
    importPreview: (): Promise<IpcResult<ImportPreview>> =>
      ipcRenderer.invoke(IPC.stringsImportPreview),
    import: (input: ImportInput): Promise<IpcResult<ImportSummary>> =>
      ipcRenderer.invoke(IPC.stringsImport, input),
    onFileChanged: (listener: (payload: FileChanged) => void): (() => void) =>
      subscribe(IPC_EVENT.fileChanged, listener)
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
      subscribe(IPC_EVENT.agentChatError, listener)
  }
} as const

export type BabelApi = typeof api

contextBridge.exposeInMainWorld('babel', api)
