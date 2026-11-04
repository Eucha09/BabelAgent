import type * as AgentSdk from '@anthropic-ai/claude-agent-sdk'
import type { AnyZodRawShape, InferShape } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { termKey } from '@core/glossary/entries'
import { applyStyleRuleChange } from '@core/project/rules'
import type { SubmitVerdict } from '@core/submit'
import { checkTerms, TERMS_INPUT_SHAPE } from '@core/terms/submission'
import { filterTermsForTexts } from '@core/translate/glossary'
import type { OpenProject, StyleRuleChange } from '@shared/schema/project'
import {
  appendGlossaryCandidates,
  GLOSSARY_FILE,
  loadAllGlossaryTerms,
  loadGlossaryTerms,
  loadMaster,
  loadTranslations
} from '../project/store'
import { msg } from '../i18n'

type Sdk = typeof AgentSdk

export const MCP_SERVER_NAME = 'babel'

/** allowedTools 에 넣는 이름. SDK 는 MCP 도구를 mcp__<서버>__<도구> 로 부른다. */
export function mcpToolName(tool: string): string {
  return `mcp__${MCP_SERVER_NAME}__${tool}`
}

/** 첫 제출 + 수정 한 번 */
export const MAX_SUBMISSIONS = 2

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

/** 도구 응답은 짧은 JSON 으로 돌려준다. 긴 설명은 토큰만 쓴다. */
function reply(value: unknown, isError = false): ToolResult {
  const content = [{ type: 'text' as const, text: JSON.stringify(value) }]
  return isError ? { content, isError: true } : { content }
}

export type SubmitEvent =
  /** remarkCount: 받았지만 알릴 것의 수(남은 길이·용어 오류, 버린 항목) */
  | { ok: true; attempt: number; count: number; remarkCount: number; remarks: string | null }
  | { ok: false; attempt: number; problems: string; final: boolean }

export type SubmitServer<T> = {
  server: ReturnType<Sdk['createSdkMcpServer']>
  accepted: () => T[] | null
  lastProblems: () => string | null
}

export type SubmitSpec<S extends AnyZodRawShape, I, T> = {
  tool: string
  description: string
  shape: S
  /** 도구 입력에서 제출 항목을 꺼낸다 */
  read: (args: InferShape<S>) => I[]
  judge: (items: I[], final: boolean) => SubmitVerdict<T>
}

/**
 * 배치(또는 재번역 행) 하나 전용 제출 서버. 제출은 "요청"이고, 받을지는 judge 가 정한다.
 * 문제가 있으면 돌려줘서 같은 세션 안에서 한 번 고칠 기회를 준다.
 * 받은 제출은 보관만 하고, 기록은 세션이 끝난 뒤 호출한 쪽이 한 번에 한다.
 */
export function createSubmitServer<S extends AnyZodRawShape, I, T>(
  sdk: Sdk,
  spec: SubmitSpec<S, I, T>,
  onEvent: (event: SubmitEvent) => void
): SubmitServer<T> {
  let attempts = 0
  let accepted: T[] | null = null
  let lastProblems: string | null = null

  const submit = sdk.tool(spec.tool, spec.description, spec.shape, async (args) => {
    if (accepted) return reply({ ok: true, note: 'already accepted' })
    if (attempts >= MAX_SUBMISSIONS) {
      return reply({ ok: false, message: 'No more submissions are accepted for this batch.' }, true)
    }
    attempts += 1

    const verdict = spec.judge(spec.read(args), attempts >= MAX_SUBMISSIONS)
    if (verdict.kind !== 'accept') {
      lastProblems = verdict.problems
      onEvent({ ok: false, attempt: attempts, problems: lastProblems, final: verdict.kind === 'reject' })
      return reply({ ok: false, problems: lastProblems, submissionsLeft: MAX_SUBMISSIONS - attempts }, true)
    }

    accepted = verdict.items
    onEvent({ ok: true, attempt: attempts, count: verdict.items.length, remarkCount: verdict.remarkCount, remarks: verdict.remarks })
    return verdict.remarks
      ? reply({ ok: true, accepted: verdict.items.length, notes: verdict.remarks })
      : reply({ ok: true, accepted: verdict.items.length })
  })

  return {
    server: sdk.createSdkMcpServer({ name: MCP_SERVER_NAME, version: '1.0.0', tools: [submit] }),
    accepted: () => accepted,
    lastProblems: () => lastProblems
  }
}

/** 패널 세션의 도구. 읽기 셋과, 저장 전에 사람의 확인을 거치는 쓰기 둘. */
export const PANEL_TOOL_NAMES = [
  'get_project_context',
  'get_strings_batch',
  'get_glossary_terms',
  'update_project_rules',
  'propose_glossary_terms'
] as const

export type PanelToolCall = { name: string; summary: string; ok: boolean }

export type PanelHooks = {
  /** 부를 때마다 패널에 도구 줄을 남긴다 */
  onCall: (call: PanelToolCall) => void
  /** 스타일 규칙 제안. 저장하지 않고 패널에 확인 카드를 띄운다 */
  onRuleProposal: (change: StyleRuleChange, currentText: string | null) => void
  /** 도구가 프로젝트 파일을 썼다(용어 후보). 그 파일을 보는 화면이 다시 읽는다 */
  onDataWritten: (file: string) => void
}


/**
 * 에이전트 패널 채팅용 도구. 읽기 도구는 프로젝트 파일을 읽기만 한다.
 * 쓰기 도구는 "요청"이다 — 스타일 규칙은 사용자가 카드에서 [저장]을 눌러야, 용어 후보는 용어집 화면에서
 * 승인해야 반영된다. 설정은 부를 때마다 지금 값(getProject)을 읽는다 — 같은 세션에서 규칙이 바뀔 수 있다.
 */
export function createPanelServer(
  sdk: Sdk,
  getProject: () => OpenProject | null,
  hooks: PanelHooks
): ReturnType<Sdk['createSdkMcpServer']> {
  const { onCall } = hooks
  const closed = (name: string): ToolResult => {
    onCall({ name, summary: msg().panelTools.projectClosed, ok: false })
    return reply({ ok: false, message: 'No project is open.' }, true)
  }

  const projectContext = sdk.tool(
    'get_project_context',
    'Project settings: source and target languages, game intro, tone guide, style rules with ids, and string count.',
    {},
    async () => {
      const project = getProject()
      if (!project) return closed('get_project_context')
      const { dir, config } = project
      const master = loadMaster(dir)
      const count = master.ok ? master.value.rows.length : 0
      onCall({ name: 'get_project_context', summary: msg().panelTools.context(count, config.styleRules.length), ok: true })
      return reply({
        name: config.name,
        sourceLanguage: config.sourceLanguage,
        targetLanguages: config.targetLanguages,
        game: config.game,
        styleRules: config.styleRules.map((rule) => ({ id: rule.id, text: rule.text })),
        stringCount: count
      })
    }
  )

  const stringsBatch = sdk.tool(
    'get_strings_batch',
    'Look up source strings and their translations by key, up to 50 keys at a time.',
    { keys: z.array(z.string()).max(50) },
    async ({ keys }) => {
      const project = getProject()
      if (!project) return closed('get_strings_batch')
      const { dir, config } = project
      const master = loadMaster(dir)
      if (!master.ok) {
        onCall({ name: 'get_strings_batch', summary: master.error.message, ok: false })
        return reply({ ok: false, message: master.error.message }, true)
      }
      const translations = new Map(
        config.targetLanguages.map((language) => {
          const loaded = loadTranslations(dir, language)
          return [language, new Map((loaded.ok ? loaded.value.rows : []).map((row) => [row.key, row]))]
        })
      )
      const byKey = new Map(master.value.rows.map((row) => [row.key, row]))
      const found = keys.flatMap((key) => {
        const row = byKey.get(key)
        if (!row) return []
        const perLanguage = Object.fromEntries(
          config.targetLanguages.map((language) => {
            const translation = translations.get(language)?.get(key)
            return [language, translation ? { text: translation.text, status: translation.status } : null]
          })
        )
        return [{ key, source: row.source, context: row.context, ui_type: row.ui_type, max_len: row.max_len, translations: perLanguage }]
      })
      const missing = keys.filter((key) => !byKey.has(key))
      onCall({
        name: 'get_strings_batch',
        summary: `${msg().panelTools.strings(found.length)}${missing.length ? msg().panelTools.stringsMissing(missing.length) : ''}`,
        ok: true
      })
      return reply({ strings: found, missing })
    }
  )

  const glossaryTerms = sdk.tool(
    'get_glossary_terms',
    'Approved glossary terms for a target language that appear in the given texts.',
    { language: z.string(), texts: z.array(z.string()).max(100) },
    async ({ language, texts }) => {
      const project = getProject()
      if (!project) return closed('get_glossary_terms')
      const loaded = loadGlossaryTerms(project.dir, language)
      if (!loaded.ok) {
        onCall({ name: 'get_glossary_terms', summary: loaded.error.message, ok: false })
        return reply({ ok: false, message: loaded.error.message }, true)
      }
      const terms = filterTermsForTexts(loaded.value, texts, project.config.sourceLanguage)
      onCall({ name: 'get_glossary_terms', summary: msg().panelTools.glossary(language, terms.length), ok: true })
      return reply({ terms })
    }
  )

  const updateRules = sdk.tool(
    'update_project_rules',
    'Propose adding, updating, or removing one style rule that applies to every future translation batch. The user must confirm it in the panel before it is saved. Get rule ids from get_project_context.',
    {
      op: z.enum(['add', 'update', 'remove']),
      id: z.string().optional().describe('Rule id for update and remove'),
      text: z.string().optional().describe('Rule text for add and update, written as a short instruction')
    },
    async ({ op, id, text }) => {
      const project = getProject()
      if (!project) return closed('update_project_rules')
      const change: StyleRuleChange | null =
        op === 'add'
          ? { op, text: text ?? '' }
          : id === undefined
            ? null
            : op === 'update'
              ? { op, id, text: text ?? '' }
              : { op, id }
      if (!change) {
        onCall({ name: 'update_project_rules', summary: msg().panelTools.noId, ok: false })
        return reply({ ok: false, code: 'missing-id' }, true)
      }
      // 저장은 하지 않고, 지금 규칙에 적용해 봐서 문제가 있으면 바로 알린다
      const tried = applyStyleRuleChange(project.config.styleRules, change, new Date().toISOString(), msg())
      if (!tried.ok) {
        onCall({ name: 'update_project_rules', summary: tried.problem.message, ok: false })
        return reply({ ok: false, code: tried.problem.code }, true)
      }
      const current = change.op === 'add' ? null : (project.config.styleRules.find((rule) => rule.id === change.id)?.text ?? null)
      onCall({ name: 'update_project_rules', summary: msg().panelTools.ruleProposed[change.op], ok: true })
      hooks.onRuleProposal(change, current)
      return reply({ ok: true, status: 'awaiting_user_confirmation' })
    }
  )

  const proposeTerms = sdk.tool(
    'propose_glossary_terms',
    'Add glossary term candidates. They stay pending until the user approves them on the Glossary screen. Terms already in the glossary are skipped.',
    TERMS_INPUT_SHAPE,
    async ({ terms }) => {
      const project = getProject()
      if (!project) return closed('propose_glossary_terms')
      const { dir, config } = project
      const known = loadAllGlossaryTerms(dir)
      if (!known.ok) {
        onCall({ name: 'propose_glossary_terms', summary: known.error.message, ok: false })
        return reply({ ok: false, message: known.error.message }, true)
      }
      const checked = checkTerms({
        items: terms,
        targetLanguages: config.targetLanguages,
        existing: new Set(known.value.map(termKey))
      })
      const written = appendGlossaryCandidates(dir, checked.valid, config.targetLanguages)
      if (!written.ok) {
        onCall({ name: 'propose_glossary_terms', summary: written.error.message, ok: false })
        return reply({ ok: false, message: written.error.message }, true)
      }
      const { added } = written.value
      const existing = [...checked.known, ...written.value.existing]
      if (added.length > 0) hooks.onDataWritten(GLOSSARY_FILE)
      onCall({
        name: 'propose_glossary_terms',
        summary: `${msg().panelTools.termsAdded(added.length)}${existing.length ? msg().panelTools.termsExisting(existing.length) : ''}${checked.issues.length ? msg().panelTools.termsRejected(checked.issues.length) : ''}`,
        ok: checked.issues.length === 0
      })
      return reply({
        ok: true,
        added,
        ...(existing.length > 0 ? { alreadyInGlossary: existing } : {}),
        ...(checked.issues.length > 0 ? { rejected: checked.issues.join('; ') } : {})
      })
    }
  )

  return sdk.createSdkMcpServer({
    name: MCP_SERVER_NAME,
    version: '1.0.0',
    tools: [projectContext, stringsBatch, glossaryTerms, updateRules, proposeTerms]
  })
}
