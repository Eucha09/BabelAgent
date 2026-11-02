import { z } from 'zod'
import type { TermConflict } from '@shared/schema/glossary'
import type { ProjectConfig, TranslationStatus } from '@shared/schema/project'
import type { MasterRow, TranslationRow } from '@shared/schema/strings'
import { termKey, type GlossaryCandidate } from '../glossary/entries'
import { findTermsInSource, usesTranslation } from '../qa/glossary'
import { settleItems, type SubmitVerdict } from '../submit'
import { gameSection, languageLabel, section, styleRulesSection } from '../translate/prompt'
import { checkTerms, SubmittedTerm } from './submission'

/**
 * 사용자가 고른 용어 하나를 에이전트로 채워 추가한다(용어집 화면의 [용어 추가]).
 * 원문에서 쓰인 곳은 코드가 찾고, 에이전트는 그 예문을 보고 대상 언어별 번역과 빈 칸(품사·지침)을 채운다.
 */

/** 제출 도구 이름. 용어 하나만 받는다. */
export const TERM_ENTRY_TOOL = 'submit_glossary_entry'

/** 도구 입력 모양(zod raw shape) */
export const TERM_ENTRY_INPUT_SHAPE = { entry: SubmittedTerm }

/** 예문으로 줄 최대 행 수. 문맥을 잡기에 충분하고 프롬프트가 길어지지 않게. */
export const MAX_TERM_EXAMPLES = 8

/** 원문에서 그 용어가 나오는 행. 찾는 방식은 QA·번역 배치와 같다 — 나중에 검사하는 범위와 정확히 같아야 한다. */
export function findTermUsages(term: string, rows: readonly MasterRow[], sourceLanguage: string): MasterRow[] {
  const probe = [{ term: term.trim() }]
  return rows.filter((row) => findTermsInSource(row.source, probe, sourceLanguage).length > 0)
}

/** 언어 코드 → (키 → 번역 행) */
export type TranslationsByLanguage = ReadonlyMap<string, ReadonlyMap<string, TranslationRow>>

export type TermExample = {
  key: string
  source: string
  context: string
  /** 번역문이 있는 언어만 */
  translations: Record<string, { text: string; status: TranslationStatus }>
}

const STATUS_RANK: Record<TranslationStatus, number> = { approved: 0, review: 1, draft: 2, stale: 3, untranslated: 4 }

/**
 * 예문을 고른다. 기존 번역이 있는 행, 그중에서도 승인된 행을 앞에 둔다 — 이미 정한 번역을 에이전트가 따르게.
 * 같은 순위끼리는 원문 순서를 지킨다.
 */
export function pickTermExamples(
  usages: readonly MasterRow[],
  translations: TranslationsByLanguage,
  limit = MAX_TERM_EXAMPLES
): TermExample[] {
  const examples = usages.map((row, index) => {
    const found: TermExample['translations'] = {}
    let best = STATUS_RANK.untranslated
    for (const [language, byKey] of translations) {
      const translation = byKey.get(row.key)
      if (!translation || translation.text.trim() === '') continue
      found[language] = { text: translation.text, status: translation.status }
      best = Math.min(best, STATUS_RANK[translation.status])
    }
    return { index, best, example: { key: row.key, source: row.source, context: row.context, translations: found } }
  })
  return examples
    .sort((a, b) => a.best - b.best || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.example)
}

/**
 * 용어 프롬프트(용어 번역·[용어 추가]·[선택 재번역])가 톤 가이드·스타일 규칙을 따르는 범위. 규칙은 문장 번역과 같은 목록이라
 * 반말·존댓말처럼 문장에만 맞는 규칙도 섞여 있다 — 용어 표기에 해당하는 것만 따르게 한다(사용자 요청, 2026-11-02).
 */
export const TERM_STYLE_LINE =
  '- Follow the tone guide and the style rules below where they concern how names and terms are written, such as capitalization, transliteration, or script. Ignore rules that only apply to whole sentences, such as speech level or sentence punctuation.'

/** 고정 부분. 프로젝트 설정이 같으면 문자 하나까지 같다(프롬프트 캐싱). */
export function buildTermEntrySystemPrompt(config: ProjectConfig): string {
  const source = languageLabel(config.sourceLanguage)
  const targets = config.targetLanguages.map(languageLabel).join(', ')
  return [
    'You are a terminology specialist for game localization.',
    'The user is adding one term to the project glossary. Fill in its entry so that the term is translated the same way everywhere.',
    '',
    'Entry:',
    `- translations: one translation for each target language: ${targets || '(none)'}. Use the language codes as given.`,
    '- Read the example strings to understand what the term means in this game before translating it.',
    '- If the existing translations of the examples already render the term consistently, especially approved ones, use that rendering. If they disagree, choose the best one and explain why in reason.',
    TERM_STYLE_LINE,
    `- pos and note: keep any value the user gave. Fill in the ones marked as empty or marked to rewrite. note is an optional usage rule for translators; write it in ${source}.`,
    `- reason: why you chose these translations, written in ${source}.`,
    '- confidence: 0 to 1.',
    '',
    'Output:',
    `- Call the ${TERM_ENTRY_TOOL} tool exactly once with the entry for this term, spelled exactly as given. Do not answer with text.`,
    '- If the tool reports problems, fix them and call it one more time.',
    '',
    gameSection(config),
    '',
    section('Tone guide', config.game.toneGuide),
    '',
    styleRulesSection(config)
  ].join('\n')
}

export type TermHints = { pos: string; note: string }

const EMPTY_HINT = '(empty: fill it in)'
const REWRITE_HINT = '(rewrite it: see "Current entry")'

/**
 * 이미 있는 용어를 다시 번역할 때(용어집 화면의 [선택 재번역]) 지금 번역·지침과 검토자 지시.
 * 지침은 새 번역에 맞게 다시 받는다 — 옛 번역을 가리키는 지침이 새 번역과 어긋나지 않게(사용자 요청, 2026-10-26).
 */
export type TermRevision = {
  translations: Readonly<Record<string, string>>
  /** 지금 지침. 다시 쓸 때 참고로 준다 */
  note: string
  /** 사용자가 쓴 그대로 넣는다. 비었으면 더 나은 대안을 달라고 한다 */
  instruction: string
}

/**
 * 가변 부분. 용어, 사용자가 준 값, 원문에서 찾은 예문. 다시 번역할 때는 지금 번역·지침과 검토자 지시를 더하고,
 * 지침은 사용자가 준 값 대신 다시 쓰라고 표시한다. 고정 부분은 추가와 재번역이 같은 문자열을 쓴다(캐싱).
 */
export function buildTermEntryPrompt(
  term: string,
  hints: TermHints,
  examples: readonly TermExample[],
  found: number,
  revision?: TermRevision
): string {
  const items = examples.map((example) => {
    const item: Record<string, unknown> = { key: example.key, source: example.source }
    if (example.context) item['context'] = example.context
    if (Object.keys(example.translations).length > 0) item['translations'] = example.translations
    return item
  })
  const parts = [
    section('Term', term.trim()),
    '',
    '# Given by the user',
    `pos: ${hints.pos.trim() || EMPTY_HINT}`,
    `note: ${revision ? REWRITE_HINT : hints.note.trim() || EMPTY_HINT}`,
    '',
    found === 0
      ? '# Example strings\n(the term does not appear in the source strings yet; rely on the game description)'
      : `# Example strings (${examples.length} of ${found} that contain the term)\n${JSON.stringify(items, null, 1)}`
  ]
  if (revision) {
    const current = [
      ...Object.entries(revision.translations).map(([language, text]) => `${language}: ${text.trim() || '(empty)'}`),
      `note: ${revision.note.trim() || '(empty)'}`
    ].join('\n')
    parts.push(
      '',
      section('Current entry', current),
      '',
      '# Reviewer request',
      revision.instruction.trim() === '' ? 'Offer a better alternative to the current translations.' : revision.instruction.trim(),
      '',
      'Translate the term again following the reviewer request. Submit a translation for every target language, even where you keep the current one.',
      'Rewrite note so that it agrees with the new translations: keep guidance that still applies, fix or drop anything that refers to the old translations, and submit an empty note if no usage rule is needed.'
    )
  }
  return parts.join('\n')
}

/**
 * 제출을 판정한다. 같은 용어여야 하고(대소문자 무시), 대상 언어마다 번역이 있어야 한다.
 * 첫 제출의 문제는 돌려줘 한 번 고치게 하고, 마지막 제출에도 남으면 받지 않는다.
 */
export function judgeTermEntry(input: {
  term: string
  item: z.infer<typeof SubmittedTerm>
  targetLanguages: readonly string[]
  final: boolean
}): SubmitVerdict<GlossaryCandidate> {
  const issues: string[] = []
  if (termKey(input.item.term) !== termKey(input.term)) {
    issues.push(`term must be exactly "${input.term.trim()}" (got "${input.item.term}")`)
  }
  const checked = checkTerms({ items: [input.item], targetLanguages: input.targetLanguages, existing: new Set() })
  issues.push(...checked.issues)
  const given = new Map((input.item.translations ?? []).map((entry) => [entry.language, entry.text.trim()]))
  const missing = input.targetLanguages.filter((language) => (given.get(language) ?? '') === '')
  if (missing.length > 0) issues.push(`missing translations: ${missing.join(', ')}`)
  const valid = issues.length === 0 ? checked.valid.map((candidate) => ({ ...candidate, term: input.term.trim() })) : []
  return settleItems(valid, issues, input.final, true)
}

/** 사용자가 준 품사·지침·strict 는 에이전트 값보다 앞선다. 비운 칸만 에이전트 값을 쓴다. */
export function applyTermHints(candidate: GlossaryCandidate, hints: TermHints & { strict: boolean }): GlossaryCandidate {
  return {
    ...candidate,
    pos: hints.pos.trim() || candidate.pos,
    note: hints.note.trim() || candidate.note,
    strict: hints.strict
  }
}

/**
 * 이 번역으로 확정하면 용어집 위반이 될 기존 번역 행. QA 의 준수 판정(usesTranslation)을 그대로 쓴다.
 * 번역문이 빈 행은 보지 않는다.
 */
export function findTermConflicts(
  fixed: Readonly<Record<string, string>>,
  usages: readonly MasterRow[],
  translations: TranslationsByLanguage
): TermConflict[] {
  const conflicts: TermConflict[] = []
  for (const [language, text] of Object.entries(fixed)) {
    if (text.trim() === '') continue
    const byKey = translations.get(language)
    if (!byKey) continue
    const keys = usages
      .filter((row) => {
        const translation = byKey.get(row.key)
        return translation !== undefined && translation.text.trim() !== '' && !usesTranslation(translation.text, text, language)
      })
      .map((row) => row.key)
    if (keys.length > 0) conflicts.push({ language, keys })
  }
  return conflicts
}
