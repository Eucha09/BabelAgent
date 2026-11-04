import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { termKey, type GlossaryCandidate } from '@core/glossary/entries'
import {
  applyTermHints,
  buildTermEntryPrompt,
  buildTermEntrySystemPrompt,
  findTermConflicts,
  findTermUsages,
  judgeTermEntry,
  pickTermExamples,
  TERM_ENTRY_INPUT_SHAPE,
  TERM_ENTRY_TOOL,
  type TermExample,
  type TermHints,
  type TermRevision,
  type TranslationsByLanguage
} from '@core/terms/addition'
import type { AddTermInput, AddTermResult, RetranslateTermInput, RetranslateTermResult } from '@shared/schema/glossary'
import type { JobLogEntry } from '@shared/schema/jobs'
import type { OpenProject } from '@shared/schema/project'
import type { MasterRow, TranslationRow } from '@shared/schema/strings'
import { fail, ok, type IpcResult } from '@shared/types'
import { loadAgentSdk } from '../agent/sdk'
import { agentQueryOptions } from '../agent/session'
import { runSubmitSession } from '../agent/submit-session'
import { createSubmitServer, mcpToolName } from '../agent/tools'
import { appendGlossaryCandidates, loadAllGlossaryTerms, loadGlossary, loadMaster, loadTranslations } from '../project/store'
import { MAX_TURNS } from './agent-batch'
import { msg, uiLanguage } from '../i18n'
import { UI_LOCALE } from '@shared/i18n'

type Auth = { cliPath: string | null; configDir: string | null }
type Log = (entry: Omit<JobLogEntry, 'at'>) => void

const running = new Map<string, AbortController>()

/** 용어 추가·재번역 세션 취소 */
export function cancelTermSession(requestId: string): boolean {
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

type TermMaterial = {
  usages: MasterRow[]
  translations: TranslationsByLanguage
  examples: TermExample[]
}

/** 원문에서 그 용어가 쓰인 행과 그 행들의 기존 번역, 예문. 찾는 방식은 QA·번역 배치와 같다. */
function gatherTermMaterial(project: OpenProject, term: string): IpcResult<TermMaterial> {
  const { dir, config } = project
  const master = loadMaster(dir)
  if (!master.ok) return master
  const usages = findTermUsages(term, master.value.rows, config.sourceLanguage)
  const translations = new Map<string, Map<string, TranslationRow>>()
  for (const language of config.targetLanguages) {
    const loaded = loadTranslations(dir, language)
    if (!loaded.ok) return loaded
    translations.set(language, new Map(loaded.value.rows.map((row) => [row.key, row])))
  }
  return ok({ usages, translations, examples: pickTermExamples(usages, translations) })
}

/**
 * 용어 항목 하나를 일회성 세션으로 받는다(추가·재번역 공통). 고정 프롬프트는 둘이 같은 문자열이다.
 * 결과는 쓰지 않고 돌려준다. 한도에 걸려도 자동으로 다시 시도하지 않는다.
 */
async function runTermEntrySession(
  project: OpenProject,
  input: {
    requestId: string
    term: string
    hints: TermHints
    material: TermMaterial
    revision?: TermRevision
    /** 로그 머리. 예: 용어 추가 "바벨탑" */
    label: string
  },
  auth: Auth,
  log: Log
): Promise<IpcResult<GlossaryCandidate>> {
  const { dir, config } = project
  const { term, label, material } = input

  let sdk: Awaited<ReturnType<typeof loadAgentSdk>>
  try {
    sdk = await loadAgentSdk()
  } catch (error) {
    return fail('agent', msg().errors.sdkLoadFailed, String(error))
  }

  log({
    level: 'info',
    batchId: null,
    message: msg().jobLog.termStart(
      label,
      material.usages.length,
      material.examples.length,
      input.revision?.instruction.trim() ? msg().jobLog.instruction(input.revision.instruction.trim()) : ''
    )
  })
  const submit = createSubmitServer(
    sdk,
    {
      tool: TERM_ENTRY_TOOL,
      description: 'Submit the glossary entry for the term. Call once; if problems are reported, fix them and call once more.',
      shape: TERM_ENTRY_INPUT_SHAPE,
      read: (args) => [args.entry],
      judge: (items, final) => {
        const [item] = items
        return item
          ? judgeTermEntry({ term, item, targetLanguages: config.targetLanguages, final })
          : { kind: 'retry', problems: 'no entry' }
      }
    },
    (event) => {
      if (!event.ok) {
        log({ level: 'warn', batchId: null, message: msg().jobLog.validationFailedOnce(label, TERM_ENTRY_TOOL, event.attempt), detail: event.problems })
      }
    }
  )

  const options: Options = {
    ...agentQueryOptions(dir, auth.cliPath, auth.configDir),
    includePartialMessages: false,
    systemPrompt: buildTermEntrySystemPrompt(config),
    mcpServers: { babel: submit.server },
    allowedTools: [mcpToolName(TERM_ENTRY_TOOL)],
    maxTurns: MAX_TURNS,
    effort: config.translate.effort
  }
  if (config.translate.model !== 'default') options.model = config.translate.model

  const controller = new AbortController()
  running.set(input.requestId, controller)
  let session: Awaited<ReturnType<typeof runSubmitSession>>
  try {
    const prompt = buildTermEntryPrompt(term, input.hints, material.examples, material.usages.length, input.revision)
    session = await runSubmitSession(sdk, options, prompt, controller.signal)
  } finally {
    running.delete(input.requestId)
  }

  const accepted = submit.accepted()?.[0]
  if (accepted) return ok(accepted)

  if (controller.signal.aborted) {
    log({ level: 'info', batchId: null, message: msg().jobLog.cancelledLog(label) })
    return fail('cancelled', msg().jobLog.cancelled)
  }
  if (session.limit) {
    log({ level: 'warn', batchId: null, message: msg().jobLog.limitLog(label) })
    return fail('limit', msg().jobLog.limitHit(describeReset(session.limit.resetsAt)))
  }
  const problems = submit.lastProblems()
  const [message, detail] = problems
    ? [msg().jobLog.entryRejected, problems]
    : session.agentError
      ? [msg().jobLog.agentFailed, session.agentError]
      : [msg().jobLog.noEntry, undefined]
  log(
    detail === undefined
      ? { level: 'error', batchId: null, message: msg().jobLog.failed(label, message) }
      : { level: 'error', batchId: null, message: msg().jobLog.failed(label, message), detail }
  )
  return fail('agent', message, detail)
}

function describeConflicts(conflicts: readonly { language: string; keys: string[] }[]): string {
  return conflicts.length > 0 ? msg().jobLog.conflicts(conflicts.map((item) => `${item.language} ${item.keys.length}`).join(', ')) : ''
}

/**
 * 용어 하나를 에이전트로 채워 승인 대기로 추가한다(용어집 화면의 [용어 추가]).
 * - 원문에서 쓰인 곳은 코드가 찾는다. 원문에 없는 용어는 받지 않는다(사용자 결정, 2026-10-26)
 * - 예문과 그 행의 기존 번역을 주고, 에이전트는 대상 언어별 번역과 사용자가 비운 품사·지침을 채운다
 * - 결과는 pending 으로 붙는다. 사람이 그리드에서 확인하고 승인한다
 */
export async function runTermAddition(
  project: OpenProject,
  input: AddTermInput,
  auth: Auth,
  log: Log
): Promise<IpcResult<AddTermResult>> {
  const { dir, config } = project
  const term = input.term.trim()
  if (term === '') return fail('invalid-input', msg().jobLog.enterTerm)
  if (config.targetLanguages.length === 0) return fail('invalid-input', msg().jobLog.noTargets)

  const known = loadAllGlossaryTerms(dir)
  if (!known.ok) return known
  if (known.value.some((item) => termKey(item) === termKey(term))) return fail('invalid-input', msg().jobLog.termExists(term))

  const material = gatherTermMaterial(project, term)
  if (!material.ok) return material
  if (material.value.usages.length === 0) {
    return fail('invalid-input', msg().jobLog.termNotFound(term))
  }

  const label = msg().jobLog.termAddLabel(term)
  const session = await runTermEntrySession(
    project,
    { requestId: input.requestId, term, hints: { pos: input.pos, note: input.note }, material: material.value, label },
    auth,
    log
  )
  if (!session.ok) return session

  const candidate = applyTermHints(session.value, { pos: input.pos, note: input.note, strict: input.strict })
  const written = appendGlossaryCandidates(dir, [candidate], config.targetLanguages)
  if (!written.ok) return written
  // 세션이 도는 사이 누가 같은 용어를 넣었으면 기록하지 않았다
  if (written.value.added.length === 0) return fail('invalid-input', msg().jobLog.termAddedMeanwhile(term))

  const view = loadGlossary(dir, config.targetLanguages)
  if (!view.ok) return view
  const entry = view.value.entries.find((item) => termKey(item.term) === termKey(term))
  if (!entry) return fail('unknown', msg().jobLog.termReloadFailed)
  const { usages, translations, examples } = material.value
  const conflicts = findTermConflicts(candidate.translations, usages, translations)
  log({
    level: conflicts.length > 0 ? 'warn' : 'ok',
    batchId: null,
    message: msg().jobLog.termPending(label, session.value.confidence, describeConflicts(conflicts)),
    detail: Object.entries(candidate.translations).map(([language, text]) => `${language}: ${text}`).join('\n')
  })
  return ok({ entry, found: usages.length, examples: examples.length, conflicts })
}

/**
 * 이미 있는 용어 하나를 다시 번역한다(용어집 화면의 [선택 재번역]). 결과는 쓰지 않고 돌려준다 —
 * 화면이 그 행의 칸에 미저장 편집으로 채우고 사람이 [저장]해야 반영된다. 번역과 함께 지침도 새 번역에 맞게
 * 다시 받는다(옛 번역을 가리키는 지침이 남지 않게). 품사와 상태는 그대로 둔다.
 * 원문에 아직 없는 용어도 다시 번역할 수 있다(예문 없이).
 */
export async function runTermRetranslation(
  project: OpenProject,
  input: RetranslateTermInput,
  auth: Auth,
  log: Log
): Promise<IpcResult<RetranslateTermResult>> {
  const { dir, config } = project
  const term = input.term.trim()
  if (config.targetLanguages.length === 0) return fail('invalid-input', msg().jobLog.noTargets)
  const known = loadAllGlossaryTerms(dir)
  if (!known.ok) return known
  if (!known.value.some((item) => termKey(item) === termKey(term))) return fail('invalid-input', msg().jobLog.termNotInGlossary(term))

  const material = gatherTermMaterial(project, term)
  if (!material.ok) return material

  const label = msg().jobLog.termRetranslateLabel(term)
  const current = Object.fromEntries(config.targetLanguages.map((language) => [language, input.translations[language] ?? '']))
  const session = await runTermEntrySession(
    project,
    {
      requestId: input.requestId,
      term,
      // 품사는 사용자가 준 값으로 넘겨 바꾸지 않게 하고, 지침은 지금 값을 보여 주고 새 번역에 맞게 다시 쓰게 한다
      hints: { pos: input.pos, note: '' },
      material: material.value,
      revision: { translations: current, note: input.note, instruction: input.instruction },
      label
    },
    auth,
    log
  )
  if (!session.ok) return session

  const { usages, translations, examples } = material.value
  const conflicts = findTermConflicts(session.value.translations, usages, translations)
  log({
    level: conflicts.length > 0 ? 'warn' : 'ok',
    batchId: null,
    message: msg().jobLog.termCandidate(label, session.value.confidence, describeConflicts(conflicts)),
    detail: [
      ...config.targetLanguages.map(
        (language) => `${language}: ${current[language] || msg().jobLog.none} → ${session.value.translations[language] ?? ''}`
      ),
      msg().jobLog.noteChange(input.note || msg().jobLog.none, session.value.note || msg().jobLog.none)
    ].join('\n')
  })
  return ok({
    term,
    translations: session.value.translations,
    note: session.value.note,
    reason: session.value.reason,
    confidence: session.value.confidence,
    found: usages.length,
    examples: examples.length,
    conflicts
  })
}
