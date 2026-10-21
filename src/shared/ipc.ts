/** IPC 채널 이름의 단일 출처. 다른 파일에서 문자열 리터럴을 직접 쓰지 않는다. */
export const IPC = {
  appSettingsGet: 'app:settings:get',
  appSettingsSet: 'app:settings:set',
  projectPick: 'project:pick',
  projectCreate: 'project:create',
  projectOpen: 'project:open',
  projectClose: 'project:close',
  stringsList: 'strings:list',
  stringsSave: 'strings:save',
  stringsCreate: 'strings:create',
  stringsImportPreview: 'strings:import:preview',
  stringsImport: 'strings:import',
  authStatus: 'auth:status',
  authLoginStart: 'auth:login:start',
  authLoginInput: 'auth:login:input',
  authLoginCancel: 'auth:login:cancel',
  authLogout: 'auth:logout',
  usageRead: 'usage:read',
  jobStart: 'job:start',
  jobControl: 'job:control',
  jobCurrent: 'job:current',
  qaRun: 'qa:run',
  translationUpdate: 'translation:update',
  translationApprove: 'translation:approve',
  rowReroll: 'row:reroll',
  rowRerollCancel: 'row:reroll:cancel',
  agentCheck: 'agent:check',
  agentChatSend: 'agent:chat:send',
  agentChatCancel: 'agent:chat:cancel'
} as const

/** 메인 → 렌더러 단방향 이벤트. */
export const IPC_EVENT = {
  projectChanged: 'project:changed',
  authLoginOutput: 'auth:login:output',
  authLoginDone: 'auth:login:done',
  fileChanged: 'file:changed',
  jobUpdate: 'job:update',
  jobLog: 'job:log',
  agentChatTool: 'agent:chat:tool',
  agentChatDelta: 'agent:chat:delta',
  agentChatEnd: 'agent:chat:end',
  agentChatError: 'agent:chat:error'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
export type IpcEventChannel = (typeof IPC_EVENT)[keyof typeof IPC_EVENT]
