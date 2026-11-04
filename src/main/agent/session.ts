import { homedir } from "node:os"
import { join } from "node:path"
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type {
  AgentChatSendInput,
  AgentCheckResult,
  AgentError,
  AgentErrorKind
} from '@shared/schema/agent'
import { resolveClaudeExecutable } from './claude-cli'
import { loadAgentSdk } from './sdk'
import { msg } from '../i18n'

const STDERR_TAIL_LIMIT = 4000
const CHECK_TIMEOUT_MS = 20_000

/**
 * 앱의 모든 에이전트 세션 공통 옵션.
 * settingSources: [] — 사용자 PC의 Claude Code 설정과 이 저장소의 CLAUDE.md가 섞이지 않게 한다.
 * tools: [] — 내장 도구를 전부 끈다. 결정론적 작업은 M3에서 커스텀 MCP 도구로만 노출한다.
 */
/**
 * CLI가 로그인 정보를 읽는 설정 폴더. 지정하지 않으면 CLI 기본값을 그대로 쓴다.
 * 이 앱을 터미널 밖(탐색기)에서 실행하면 CLAUDE_CONFIG_DIR이 없으므로 ~/.claude를 보게 된다.
 */
export function effectiveConfigDir(configDir: string | null): string {
  return configDir ?? process.env["CLAUDE_CONFIG_DIR"] ?? join(homedir(), ".claude")
}

export function agentQueryOptions(cwd: string, cliPath: string | null, configDir: string | null): Options {
  const options: Options = {
    cwd,
    settingSources: [],
    tools: [],
    disallowedTools: ['Bash', 'Write', 'Edit', 'NotebookEdit'],
    permissionMode: 'dontAsk',
    includePartialMessages: true
  }
  // 로그인·상태 조회와 같은 실행 파일을 쓴다(설정 → 공식 설치 → PATH → SDK 내장). 설치판에는 SDK 내장 실행 파일이 없다
  const executable = resolveClaudeExecutable(cliPath)
  if (executable) options.pathToClaudeCodeExecutable = executable
  // env를 넘기면 SDK가 환경을 통째로 교체하므로 process.env를 펼쳐 넣어야 한다.
  if (configDir) options.env = { ...process.env, CLAUDE_CONFIG_DIR: configDir }
  return options
}

function tail(buffer: string): string | undefined {
  const trimmed = buffer.trim()
  if (!trimmed) return undefined
  return trimmed.length > STDERR_TAIL_LIMIT ? trimmed.slice(-STDERR_TAIL_LIMIT) : trimmed
}


/** 인증 오류에는 어느 설정 폴더를 봤는지 붙인다. 이것만 알아도 원인 절반이 잡힌다. */
function annotateConfigDir(error: AgentError, configDir: string): AgentError {
  if (error.kind !== 'auth-failed') return error
  const note = msg().errors.configDir(configDir)
  return { ...error, detail: error.detail ? `${note}
${error.detail}` : note }
}

function buildError(kind: AgentErrorKind, detail?: string): AgentError {
  const message = msg().errors.agent[kind]
  if (detail === undefined) return { kind, message }
  return { kind, message, detail }
}

/** 예외와 stderr를 보고 원인을 좁힌다. 사용자가 다음 행동을 알 수 있어야 한다. */
export function classifyAgentError(error: unknown, stderrBuffer = ''): AgentError {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const code = (error as { code?: string } | null)?.code ?? ''
  const haystack = `${raw}\n${code}\n${stderrBuffer}`.toLowerCase()
  const detail = tail(`${raw}\n${stderrBuffer}`)

  if (haystack.includes('abort')) return buildError('aborted')
  if (
    code === 'ENOENT' ||
    haystack.includes('enoent') ||
    haystack.includes('spawn') ||
    haystack.includes('command not found') ||
    haystack.includes('is not recognized')
  ) {
    return buildError('cli-not-found', detail)
  }
  if (
    haystack.includes('not logged in') ||
    haystack.includes('/login') ||
    haystack.includes('unauthorized') ||
    haystack.includes('authentication') ||
    haystack.includes('invalid api key') ||
    haystack.includes('oauth') ||
    haystack.includes('401') ||
    haystack.includes('403')
  ) {
    return buildError('auth-failed', detail)
  }
  return buildError('unknown', detail)
}

/** 로그인된 계정으로 CLI가 실행되는지 확인한다. 응답 생성 없이 계정 정보만 읽는다. */
export async function checkAgent(
  cwd: string,
  cliPath: string | null,
  configDir: string | null
): Promise<AgentCheckResult> {
  let sdk: Awaited<ReturnType<typeof loadAgentSdk>>
  try {
    sdk = await loadAgentSdk()
  } catch (error) {
    return { ok: false, error: { ...classifyAgentError(error), kind: 'sdk-load-failed' } }
  }

  let stderrBuffer = ''
  const options: Options = {
    ...agentQueryOptions(cwd, cliPath, configDir),
    includePartialMessages: false,
    stderr: (data) => {
      stderrBuffer += data
    }
  }

  const query = sdk.query({ prompt: 'Connection check', options })
  try {
    const info = await Promise.race([
      query.accountInfo(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error(msg().errors.accountTimeout)),
          CHECK_TIMEOUT_MS
        )
      )
    ])
    return {
      ok: true,
      account: {
        ...(info.email === undefined ? {} : { email: info.email }),
        ...(info.organization === undefined ? {} : { organization: info.organization }),
        ...(info.subscriptionType === undefined ? {} : { subscriptionType: info.subscriptionType }),
        ...(info.apiProvider === undefined ? {} : { apiProvider: info.apiProvider }),
        cliPath: resolveClaudeExecutable(cliPath),
        configDir: effectiveConfigDir(configDir)
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: annotateConfigDir(classifyAgentError(error, stderrBuffer), effectiveConfigDir(configDir))
    }
  } finally {
    try {
      query.close()
    } catch {
      // 이미 종료된 세션을 닫는 것은 무시한다
    }
  }
}

export type ChatEmitter = {
  delta: (text: string) => void
  end: (sessionId: string | null, durationMs: number) => void
  error: (error: AgentError) => void
}

const running = new Map<string, AbortController>()

export function cancelChat(requestId: string): boolean {
  const controller = running.get(requestId)
  if (!controller) return false
  controller.abort()
  return true
}

/**
 * 에이전트 패널 채팅. 앱에서 유일하게 resume으로 이어지는 세션이다.
 * 배치 작업은 M3에서 배치마다 새 query()로 실행한다.
 */
/**
 * 패널 채팅 역할. 도구 목록은 MCP 서버가 알려 주므로 여기서는 역할과 답하는 방식, 쓰기 도구를 언제 부를지만 정한다.
 * 지속 지시는 도구로 제안해야 배치에 반영된다 — 대화 속에만 남은 결정은 다음 배치가 모른다.
 */
const PANEL_SYSTEM_PROMPT = [
  'You are the localization assistant inside Babel Agent, a desktop app for game localization.',
  'Use the provided tools to look up the project: settings, source strings, translations, and glossary.',
  'Do not guess project data you can look up. Answer in the language the user writes in.',
  'Translation batches run in separate sessions and do not see this conversation.',
  'When the user gives a lasting instruction for future translations (for example "from now on ..." or "always ..."), call update_project_rules to propose it as a style rule.',
  'Check the existing rules and their ids with get_project_context first, and update or remove a rule instead of adding one that conflicts with it.',
  'A proposed rule is saved only after the user presses Save on the card in this panel. Tell the user that, and say that unsaved instructions will not reach translation batches.',
  'When the user asks to add glossary terms, call propose_glossary_terms with a suggested translation for each target language. The terms stay pending until the user approves them on the Glossary screen.'
].join(' ')

export type ChatTools = Pick<Options, 'mcpServers' | 'allowedTools'>

export async function runChat(
  input: AgentChatSendInput,
  cliPath: string | null,
  configDir: string | null,
  emit: ChatEmitter,
  /** SDK 를 불러온 뒤에 도구 서버를 만든다. 서버가 SDK 의 tool() 을 쓰기 때문이다. */
  tools?: (sdk: Awaited<ReturnType<typeof loadAgentSdk>>) => ChatTools
): Promise<void> {
  const startedAt = Date.now()
  let sdk: Awaited<ReturnType<typeof loadAgentSdk>>
  try {
    sdk = await loadAgentSdk()
  } catch (error) {
    emit.error({ ...classifyAgentError(error), kind: 'sdk-load-failed' })
    return
  }

  let stderrBuffer = ''
  const controller = new AbortController()
  running.set(input.requestId, controller)

  const options: Options = {
    ...agentQueryOptions(input.projectDir, cliPath, configDir),
    systemPrompt: PANEL_SYSTEM_PROMPT,
    ...(tools ? tools(sdk) : {}),
    abortController: controller,
    stderr: (data) => {
      stderrBuffer += data
    }
  }
  if (input.sessionId) options.resume = input.sessionId

  const resolvedConfigDir = effectiveConfigDir(configDir)
  const emitError = (error: unknown): void => {
    emit.error(annotateConfigDir(classifyAgentError(error, stderrBuffer), resolvedConfigDir))
  }

  let sessionId = input.sessionId
  let streamedAny = false

  try {
    const query = sdk.query({ prompt: input.text, options })
    for await (const message of query as AsyncIterable<SDKMessage>) {
      if ('session_id' in message && typeof message.session_id === 'string') {
        sessionId = message.session_id
      }

      if (message.type === 'stream_event') {
        const event = message.event
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          streamedAny = true
          emit.delta(event.delta.text)
        }
        continue
      }

      if (message.type === 'assistant') {
        if (message.error) {
          emitError(new Error(JSON.stringify(message.error)))
          return
        }
        // 스트리밍 이벤트가 오지 않는 환경 대비. 중복 출력을 막으려 한 번만 쓴다.
        if (!streamedAny) {
          for (const block of message.message.content) {
            if (block.type === 'text') emit.delta(block.text)
          }
        }
        continue
      }

      if (message.type === 'result') {
        if (message.subtype === 'success') {
          emit.end(sessionId, Date.now() - startedAt)
        } else {
          emitError(new Error(msg().errors.resultStatus(message.subtype)))
        }
        return
      }
    }
    // result 없이 스트림이 끝난 경우
    emit.end(sessionId, Date.now() - startedAt)
  } catch (error) {
    emitError(error)
  } finally {
    running.delete(input.requestId)
  }
}
