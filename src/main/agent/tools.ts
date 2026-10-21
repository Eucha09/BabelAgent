import type * as AgentSdk from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { filterTermsForTexts } from '@core/translate/glossary'
import { SUBMIT_TOOL } from '@core/translate/prompt'
import {
  describeIssues,
  SUBMIT_INPUT_SHAPE,
  type SubmissionVerdict,
  type SubmittedTranslation
} from '@core/translate/submission'
import type { OpenProject } from '@shared/schema/project'
import { loadGlossaryTerms, loadMaster, loadTranslations } from '../project/store'

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
  /** unresolved: 받았지만 남은 QA 오류 수(길이·strict 용어, 재번역 후보는 모든 오류) */
  | { ok: true; attempt: number; count: number; unresolved: number }
  | { ok: false; attempt: number; problems: string; final: boolean }

export type SubmitServer = {
  server: ReturnType<Sdk['createSdkMcpServer']>
  accepted: () => SubmittedTranslation[] | null
  lastProblems: () => string | null
}

/**
 * 배치(또는 재번역 행) 하나 전용 제출 서버. 제출은 "요청"이고, 받을지는 judge 가 정한다.
 * 키나 QA 에 문제가 있으면 돌려줘서 같은 세션 안에서 한 번 고칠 기회를 준다.
 * 받은 제출은 보관만 하고, 기록은 세션이 끝난 뒤 호출한 쪽이 한 번에 한다.
 */
export function createSubmitServer(
  sdk: Sdk,
  judge: (items: SubmittedTranslation[], final: boolean) => SubmissionVerdict,
  onEvent: (event: SubmitEvent) => void
): SubmitServer {
  let attempts = 0
  let accepted: SubmittedTranslation[] | null = null
  let lastProblems: string | null = null

  const submit = sdk.tool(
    SUBMIT_TOOL,
    'Submit the translation of every key in this batch. Call once; if problems are reported, fix them and call once more.',
    SUBMIT_INPUT_SHAPE,
    async ({ translations }) => {
      if (accepted) return reply({ ok: true, note: 'already accepted' })
      if (attempts >= MAX_SUBMISSIONS) {
        return reply({ ok: false, message: 'No more submissions are accepted for this batch.' }, true)
      }
      attempts += 1

      const verdict = judge(translations, attempts >= MAX_SUBMISSIONS)
      if (verdict.kind !== 'accept') {
        lastProblems = verdict.problems
        onEvent({ ok: false, attempt: attempts, problems: lastProblems, final: verdict.kind === 'reject' })
        return reply({ ok: false, problems: lastProblems, submissionsLeft: MAX_SUBMISSIONS - attempts }, true)
      }

      accepted = translations
      onEvent({ ok: true, attempt: attempts, count: translations.length, unresolved: verdict.unresolved.length })
      return verdict.unresolved.length > 0
        ? reply({ ok: true, accepted: translations.length, unresolved: describeIssues(verdict.unresolved) })
        : reply({ ok: true, accepted: translations.length })
    }
  )

  return {
    server: sdk.createSdkMcpServer({ name: MCP_SERVER_NAME, version: '1.0.0', tools: [submit] }),
    accepted: () => accepted,
    lastProblems: () => lastProblems
  }
}

export const PANEL_TOOL_NAMES = ['get_project_context', 'get_strings_batch', 'get_glossary_terms'] as const

export type PanelToolCall = { name: string; summary: string; ok: boolean }

/**
 * 에이전트 패널 채팅용 읽기 도구. 프로젝트 파일을 읽기만 하고 쓰지 않는다.
 * 부를 때마다 onCall 로 알려 패널에 도구 로그를 남긴다.
 */
export function createPanelServer(
  sdk: Sdk,
  project: OpenProject,
  onCall: (call: PanelToolCall) => void
): ReturnType<Sdk['createSdkMcpServer']> {
  const { dir, config } = project

  const projectContext = sdk.tool(
    'get_project_context',
    'Project settings: source and target languages, game intro, tone guide, style rules, and string count.',
    {},
    async () => {
      const master = loadMaster(dir)
      const count = master.ok ? master.value.rows.length : 0
      onCall({ name: 'get_project_context', summary: `원문 ${count}행`, ok: true })
      return reply({
        name: config.name,
        sourceLanguage: config.sourceLanguage,
        targetLanguages: config.targetLanguages,
        game: config.game,
        styleRules: config.styleRules.map((rule) => rule.text),
        stringCount: count
      })
    }
  )

  const stringsBatch = sdk.tool(
    'get_strings_batch',
    'Look up source strings and their translations by key, up to 50 keys at a time.',
    { keys: z.array(z.string()).max(50) },
    async ({ keys }) => {
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
      onCall({ name: 'get_strings_batch', summary: `${found.length}행${missing.length ? ` · 없는 키 ${missing.length}` : ''}`, ok: true })
      return reply({ strings: found, missing })
    }
  )

  const glossaryTerms = sdk.tool(
    'get_glossary_terms',
    'Approved glossary terms for a target language that appear in the given texts.',
    { language: z.string(), texts: z.array(z.string()).max(100) },
    async ({ language, texts }) => {
      const loaded = loadGlossaryTerms(dir, language)
      if (!loaded.ok) {
        onCall({ name: 'get_glossary_terms', summary: loaded.error.message, ok: false })
        return reply({ ok: false, message: loaded.error.message }, true)
      }
      const terms = filterTermsForTexts(loaded.value, texts)
      onCall({ name: 'get_glossary_terms', summary: `${language} 용어 ${terms.length}개`, ok: true })
      return reply({ terms })
    }
  )

  return sdk.createSdkMcpServer({
    name: MCP_SERVER_NAME,
    version: '1.0.0',
    tools: [projectContext, stringsBatch, glossaryTerms]
  })
}
