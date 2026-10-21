import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { checkRow } from '@core/qa/check'
import { filterTermsForTexts } from '@core/translate/glossary'
import { buildRerollPrompt, buildSystemPrompt, SUBMIT_TOOL } from '@core/translate/prompt'
import { judgeSubmission } from '@core/translate/submission'
import type { JobLogEntry } from '@shared/schema/jobs'
import type { OpenProject } from '@shared/schema/project'
import type { RerollCandidate, RerollInput } from '@shared/schema/review'
import { fail, ok, type IpcResult } from '@shared/types'
import { loadAgentSdk } from '../agent/sdk'
import { agentQueryOptions } from '../agent/session'
import { runSubmitSession } from '../agent/submit-session'
import { createSubmitServer, mcpToolName } from '../agent/tools'
import { qaContext, toQaInput } from '../project/qa'
import { loadGlossaryTerms, loadMaster, loadTranslations, trustedSnapshot } from '../project/store'
import { MAX_TURNS } from './translate-batch'

const running = new Map<string, AbortController>()

export function cancelReroll(requestId: string): boolean {
  const controller = running.get(requestId)
  if (!controller) return false
  controller.abort()
  return true
}

function describeReset(resetsAt: number | null): string {
  if (resetsAt === null) return '잠시 뒤 다시 시도하세요.'
  const time = new Date(resetsAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return `${time}에 풀립니다. 그 뒤에 다시 시도하세요.`
}

/**
 * 행 하나를 일회성 세션으로 다시 번역한다. 결과는 파일에 쓰지 않고 후보로 돌려준다 — 적용은 사람이 정한다.
 * 고정 프롬프트는 배치와 같은 문자열이라 캐시가 그대로 걸린다. 한도에 걸려도 자동으로 다시 시도하지 않는다.
 */
export async function runReroll(
  project: OpenProject,
  input: RerollInput,
  auth: { cliPath: string | null; configDir: string | null },
  log: (entry: Omit<JobLogEntry, 'at'>) => void
): Promise<IpcResult<RerollCandidate>> {
  const { dir, config } = project
  const { language, key, instruction, requestId } = input
  if (!config.targetLanguages.includes(language)) {
    return fail('invalid-input', `${language} 은 이 프로젝트의 대상 언어가 아닙니다.`)
  }
  const master = loadMaster(dir)
  if (!master.ok) return master
  const row = master.value.rows.find((item) => item.key === key)
  if (!row) return fail('invalid-input', `원문에 없는 키입니다: ${key}`)
  const translations = loadTranslations(dir, language)
  if (!translations.ok) return translations
  const current = translations.value.rows.find((item) => item.key === key)

  const glossary = loadGlossaryTerms(dir, language)
  const terms = glossary.ok ? glossary.value : []
  const qa = qaContext(config, language, terms)
  const check = (text: string) => checkRow(toQaInput(row, { text, status: 'draft', source_hash: row.source_hash }), qa)

  let sdk: Awaited<ReturnType<typeof loadAgentSdk>>
  try {
    sdk = await loadAgentSdk()
  } catch (error) {
    return fail('agent', 'Agent SDK를 불러오지 못했습니다.', String(error))
  }

  log({ level: 'info', batchId: null, message: `재번역 ${key} (${language}) 시작${instruction.trim() ? ` — 지시: ${instruction.trim()}` : ''}` })
  const submit = createSubmitServer(
    sdk,
    (items, final) =>
      judgeSubmission({ expectedKeys: [key], items, final, mode: 'candidate', qa: (item) => check(item.text) }),
    (event) => {
      if (!event.ok) {
        log({ level: 'warn', batchId: null, message: `재번역 ${key} · ${SUBMIT_TOOL} → 검증 실패 (${event.attempt}번째)`, detail: event.problems })
      }
    }
  )

  const options: Options = {
    ...agentQueryOptions(dir, auth.cliPath, auth.configDir),
    includePartialMessages: false,
    systemPrompt: buildSystemPrompt(config, language),
    mcpServers: { babel: submit.server },
    allowedTools: [mcpToolName(SUBMIT_TOOL)],
    maxTurns: MAX_TURNS
  }
  if (config.translate.model !== 'default') options.model = config.translate.model

  // 원문이 바뀐 행이면 번역이 보고 쓴 원문도 같이 준다
  const snapshot = trustedSnapshot(current)
  const previousSource = current && current.source_hash !== row.source_hash && snapshot !== '' ? snapshot : null
  const prompt = buildRerollPrompt(
    row,
    filterTermsForTexts(terms, [row.source]),
    current ? { text: current.text, previousSource } : null,
    instruction
  )

  const controller = new AbortController()
  running.set(requestId, controller)
  let session: Awaited<ReturnType<typeof runSubmitSession>>
  try {
    session = await runSubmitSession(sdk, options, prompt, controller.signal)
  } finally {
    running.delete(requestId)
  }

  const accepted = submit.accepted()?.[0]
  if (accepted) {
    log({ level: 'ok', batchId: null, message: `재번역 ${key} → 후보 받음 (신뢰도 ${accepted.confidence})` })
    return ok({
      requestId,
      language,
      key,
      text: accepted.text,
      confidence: accepted.confidence,
      note: accepted.note ?? '',
      diagnostics: check(accepted.text),
      instruction: instruction.trim()
    })
  }
  if (controller.signal.aborted) {
    log({ level: 'info', batchId: null, message: `재번역 ${key} 취소` })
    return fail('cancelled', '재번역을 취소했습니다.')
  }
  if (session.limit) {
    log({ level: 'warn', batchId: null, message: `재번역 ${key} — 사용량 한도` })
    return fail('limit', `사용량 한도에 걸렸습니다. ${describeReset(session.limit.resetsAt)}`)
  }
  const problems = submit.lastProblems()
  const [message, detail] = problems
    ? ['후보가 검증을 통과하지 못했습니다.', problems]
    : session.agentError
      ? ['에이전트 실행 중 오류가 났습니다.', session.agentError]
      : ['에이전트가 후보를 제출하지 않았습니다.', undefined]
  log(detail === undefined ? { level: 'error', batchId: null, message: `재번역 ${key} 실패: ${message}` } : { level: 'error', batchId: null, message: `재번역 ${key} 실패: ${message}`, detail })
  return fail('agent', message, detail)
}
