import { randomUUID } from 'node:crypto'
import { app, ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc'
import {
  AgentChatCancelInput,
  AgentChatSendInput,
  type AgentChatDelta,
  type AgentChatEnd,
  type AgentChatError,
  type AgentCheckResult,
  type ChatRuleProposal
} from '@shared/schema/agent'
import type { ChatToolCall, DataWritten } from '@shared/schema/jobs'
import type { UsageLimits } from '@shared/schema/usage'
import { fail, ok, type IpcResult } from '@shared/types'
import { cancelChat, checkAgent, runChat } from '../agent/session'
import { createPanelServer, mcpToolName, PANEL_TOOL_NAMES } from '../agent/tools'
import { readUsageLimits } from '../agent/usage'
import { loadAppSettings } from '../store/app-settings'
import { currentProject } from './project'
import { msg } from '../i18n'

function send(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

export function registerAgentIpc(): void {
  ipcMain.handle(IPC.agentCheck, async (): Promise<AgentCheckResult> => {
    const { cliPath, claudeConfigDir } = loadAppSettings()
    // 프로젝트가 열려 있으면 그 폴더, 없으면 앱 데이터 폴더를 작업 디렉터리로 쓴다.
    const cwd = currentProject()?.dir ?? app.getPath('userData')
    return checkAgent(cwd, cliPath, claudeConfigDir)
  })

  ipcMain.handle(IPC.usageRead, async (): Promise<IpcResult<UsageLimits>> => {
    const { cliPath, claudeConfigDir } = loadAppSettings()
    const cwd = currentProject()?.dir ?? app.getPath('userData')
    return readUsageLimits(cwd, cliPath, claudeConfigDir)
  })

  ipcMain.handle(IPC.agentChatSend, async (event, raw: unknown): Promise<IpcResult<null>> => {
    const parsed = AgentChatSendInput.safeParse(raw)
    if (!parsed.success) {
      return fail('unknown', msg().errors.invalidRequest, parsed.error.message)
    }
    const input = parsed.data
    const project = currentProject()
    if (!project || project.dir !== input.projectDir) {
      return fail('not-a-project', msg().errors.agentNeedsProject)
    }

    const { cliPath, claudeConfigDir } = loadAppSettings()
    const sender = event.sender
    // 응답은 이벤트로 흘려보내고 호출은 즉시 반환한다.
    void runChat(input, cliPath, claudeConfigDir, {
      delta: (text) => {
        const payload: AgentChatDelta = { requestId: input.requestId, text }
        send(sender, IPC_EVENT.agentChatDelta, payload)
      },
      end: (sessionId, durationMs) => {
        const payload: AgentChatEnd = { requestId: input.requestId, sessionId, durationMs }
        send(sender, IPC_EVENT.agentChatEnd, payload)
      },
      error: (error) => {
        const payload: AgentChatError = { requestId: input.requestId, ...error }
        send(sender, IPC_EVENT.agentChatError, payload)
      }
    }, (sdk) => ({
      mcpServers: {
        // 도구는 부를 때마다 지금 열린 프로젝트를 읽는다. 다른 프로젝트로 바뀌었으면 쓰지 않는다.
        babel: createPanelServer(
          sdk,
          () => {
            const now = currentProject()
            return now && now.dir === input.projectDir ? now : null
          },
          {
            onCall: (call) => {
              const payload: ChatToolCall = { requestId: input.requestId, ...call }
              send(sender, IPC_EVENT.agentChatTool, payload)
            },
            onRuleProposal: (change, currentText) => {
              const payload: ChatRuleProposal = { requestId: input.requestId, proposalId: randomUUID(), change, currentText }
              send(sender, IPC_EVENT.agentChatRule, payload)
            },
            onDataWritten: (file) => {
              const payload: DataWritten = { file }
              send(sender, IPC_EVENT.dataWritten, payload)
            }
          }
        )
      },
      allowedTools: PANEL_TOOL_NAMES.map(mcpToolName)
    }))
    return ok(null)
  })

  ipcMain.handle(IPC.agentChatCancel, (_event, raw: unknown): IpcResult<boolean> => {
    const parsed = AgentChatCancelInput.safeParse(raw)
    if (!parsed.success) return fail('unknown', msg().errors.invalidRequest)
    return ok(cancelChat(parsed.data.requestId))
  })
}
