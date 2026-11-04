import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { checkRow } from '@core/qa/check'
import { filterTermsForTexts } from '@core/translate/glossary'
import { buildRerollPrompt, buildSystemPrompt, SUBMIT_TOOL } from '@core/translate/prompt'
import { judgeSubmission, SUBMIT_INPUT_SHAPE, toSubmitVerdict } from '@core/translate/submission'
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
import { MAX_TURNS } from './agent-batch'
import { msg, uiLanguage } from '../i18n'
import { UI_LOCALE } from '@shared/i18n'

const running = new Map<string, AbortController>()

export function cancelReroll(requestId: string): boolean {
  const controller = running.get(requestId)
  if (!controller) return false
  controller.abort()
  return true
}

function describeReset(resetsAt: number | null): string {
  if (resetsAt === null) return msg().jobLog.retryLater
  const time = new Date(resetsAt).toLocaleTimeString(UI_LOCALE[uiLanguage()], { hour: '2-digit', minute: '2-digit' })
  return msg().jobLog.resetsAt(time)
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
    return fail('invalid-input', msg().errors.notTargetLanguage(language))
  }
  const master = loadMaster(dir)
  if (!master.ok) return master
  const row = master.value.rows.find((item) => item.key === key)
  if (!row) return fail('invalid-input', msg().errors.keyNotInSource(key))
  const translations = loadTranslations(dir, language)
  if (!translations.ok) return translations
  const current = translations.value.rows.find((item) => item.key === key)

  const glossary = loadGlossaryTerms(dir, language)
  const terms = glossary.ok ? glossary.value : []
  const qa = qaContext(config, language, terms)
  const check = (text: string) => checkRow(toQaInput(row, { text, status: 'draft', source_hash: row.source_hash }), qa, msg())

  let sdk: Awaited<ReturnType<typeof loadAgentSdk>>
  try {
    sdk = await loadAgentSdk()
  } catch (error) {
    return fail('agent', msg().errors.sdkLoadFailed, String(error))
  }

  log({ level: 'info', batchId: null, message: msg().jobLog.rerollStart(key, language, instruction.trim() ? msg().jobLog.instruction(instruction.trim()) : '') })
  const submit = createSubmitServer(
    sdk,
    {
      tool: SUBMIT_TOOL,
      description: 'Submit the translation of this key. Call once; if problems are reported, fix them and call once more.',
      shape: SUBMIT_INPUT_SHAPE,
      read: (args) => args.translations,
      judge: (items, final) =>
        toSubmitVerdict(
          judgeSubmission({ expectedKeys: [key], items, final, mode: 'candidate', qa: (item) => check(item.text) }),
          items
        )
    },
    (event) => {
      if (!event.ok) {
        log({ level: 'warn', batchId: null, message: msg().jobLog.validationFailedOnce(msg().jobLog.rerollLabel(key), SUBMIT_TOOL, event.attempt), detail: event.problems })
      }
    }
  )

  const options: Options = {
    ...agentQueryOptions(dir, auth.cliPath, auth.configDir),
    includePartialMessages: false,
    systemPrompt: buildSystemPrompt(config, language),
    mcpServers: { babel: submit.server },
    allowedTools: [mcpToolName(SUBMIT_TOOL)],
    maxTurns: MAX_TURNS,
    effort: config.translate.effort
  }
  if (config.translate.model !== 'default') options.model = config.translate.model

  // 원문이 바뀐 행이면 번역이 보고 쓴 원문도 같이 준다
  const snapshot = trustedSnapshot(current)
  const previousSource = current && current.source_hash !== row.source_hash && snapshot !== '' ? snapshot : null
  const prompt = buildRerollPrompt(
    row,
    filterTermsForTexts(terms, [row.source], config.sourceLanguage),
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
    log({ level: 'ok', batchId: null, message: msg().jobLog.rerollCandidate(key, accepted.confidence) })
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
    log({ level: 'info', batchId: null, message: msg().jobLog.cancelledLog(msg().jobLog.rerollLabel(key)) })
    return fail('cancelled', msg().jobLog.rerollCancelled)
  }
  if (session.limit) {
    log({ level: 'warn', batchId: null, message: msg().jobLog.limitLog(msg().jobLog.rerollLabel(key)) })
    return fail('limit', msg().jobLog.limitHit(describeReset(session.limit.resetsAt)))
  }
  const problems = submit.lastProblems()
  const [message, detail] = problems
    ? [msg().jobLog.candidateRejected, problems]
    : session.agentError
      ? [msg().jobLog.agentFailed, session.agentError]
      : [msg().jobLog.noCandidate, undefined]
  log(detail === undefined ? { level: 'error', batchId: null, message: msg().jobLog.failed(msg().jobLog.rerollLabel(key), message) } : { level: 'error', batchId: null, message: msg().jobLog.failed(msg().jobLog.rerollLabel(key), message), detail })
  return fail('agent', message, detail)
}
