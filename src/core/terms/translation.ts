import { z } from 'zod'
import type { GlossaryEntry } from '@shared/schema/glossary'
import type { ProjectConfig } from '@shared/schema/project'
import {
  formatPendingLanguages,
  glossaryStatusOf,
  parsePendingLanguages,
  PENDING_LANGUAGES_COLUMN,
  termKey,
  translationColumn
} from '../glossary/entries'
import { settleItems, type SubmitVerdict } from '../submit'
import { gameSection, languageLabel, section, styleRulesSection } from '../translate/prompt'
import { TERM_STYLE_LINE, type TermExample } from './addition'

/**
 * 용어 번역 작업(용어집 화면의 [용어 번역]). 용어집의 빈 번역 칸만 채운다 — 이미 있는 번역은 덮지 않는다(덮어쓰기는 [선택 재번역]).
 * 용어 추출은 후보만 찾고 번역은 여기서 한다. 대상 언어를 늘렸을 때 다시 추출하지 않고 새 언어 칸만 채우기 위해서다.
 */

/** 제출 도구 이름. MCP 서버에 붙일 때와 프롬프트에서 같은 값을 쓴다. */
export const TERM_TRANSLATE_TOOL = 'submit_term_translations'

/** 배치당 용어 수. 용어마다 예문이 붙으므로 문자열 번역 배치보다 작게 잡는다 */
export const TERMS_PER_BATCH = 20

/** 용어마다 줄 예문 행 수. 뜻을 잡기에 충분하고 배치 프롬프트가 길어지지 않게 */
export const EXAMPLES_PER_TERM = 3

/** 번역할 용어 하나와 채울(지금 빈) 언어 */
export type TermTranslateTarget = { term: string; languages: string[] }

/**
 * 빈 칸을 채울 용어. 고른 언어 중 번역이 빈 언어만 담는다. only 를 주면 그 용어(termKey)만 본다.
 * 승인 대기 용어와 승인된 용어를 모두 담는다.
 */
export function findTranslateTargets(
  entries: readonly GlossaryEntry[],
  languages: readonly string[],
  only?: ReadonlySet<string>
): TermTranslateTarget[] {
  const targets: TermTranslateTarget[] = []
  for (const entry of entries) {
    if (only && !only.has(termKey(entry.term))) continue
    const missing = languages.filter((language) => (entry.translations[language] ?? '').trim() === '')
    if (missing.length > 0) targets.push({ term: entry.term, languages: missing })
  }
  return targets
}

export type TermTranslateBatch = { id: number; targets: TermTranslateTarget[] }

/** 용어집 순서대로 나눈다 */
export function buildTermTranslateBatches(
  targets: readonly TermTranslateTarget[],
  perBatch = TERMS_PER_BATCH
): TermTranslateBatch[] {
  const size = Math.max(1, Math.floor(perBatch))
  const batches: TermTranslateBatch[] = []
  for (let start = 0; start < targets.length; start += size) {
    batches.push({ id: batches.length + 1, targets: targets.slice(start, start + size) })
  }
  return batches
}

/** 프롬프트에 넣는 용어 하나 */
export type TermTranslateItem = {
  term: string
  pos: string
  note: string
  /** 채울 언어 */
  translateTo: readonly string[]
  /** 용어집에 이미 있는 다른 언어 번역(참고) */
  known: Readonly<Record<string, string>>
  examples: readonly TermExample[]
  /** 원문에서 이 용어가 나온 행 수 */
  found: number
}

/**
 * 고정 부분. 프로젝트 설정이 같으면 문자 하나까지 같다(프롬프트 캐싱).
 * 대상 언어는 넣지 않는다 — 용어마다 채울 언어가 다르고, 언어를 늘려도 캐시가 남게 가변 부분에 둔다.
 */
export function buildTermTranslateSystemPrompt(config: ProjectConfig): string {
  const source = languageLabel(config.sourceLanguage)
  return [
    'You are a terminology specialist for game localization.',
    `Translate ${source} glossary terms of this game. A glossary translation is the rendering that translators must use everywhere, so choose one a player would recognize consistently.`,
    '',
    'For each term:',
    '- Translate it into every language in its translate_to. Use the language codes as given.',
    '- Read its example strings to understand what the term means in this game before translating it.',
    '- If the existing translations of the examples already render the term consistently, especially approved ones, use that rendering.',
    '- known_translations are its glossary translations in other languages. Keep the same meaning and the same naming approach, such as transliterating or translating a name.',
    '- Follow its usage note if there is one.',
    TERM_STYLE_LINE,
    '- Translate the term itself, not a sentence: no particles, endings, or punctuation from the surrounding text.',
    `- reason: optional, one short sentence when the choice is not obvious, written in ${source}.`,
    '- confidence: 0 to 1.',
    '',
    'Output:',
    `- Call the ${TERM_TRANSLATE_TOOL} tool exactly once with every term in this batch, spelled exactly as given. Do not answer with text.`,
    '- If the tool reports problems, fix them and call it one more time.',
    '',
    gameSection(config),
    '',
    section('Tone guide', config.game.toneGuide),
    '',
    styleRulesSection(config)
  ].join('\n')
}

/** 가변 부분. 이번 배치에서 쓰는 언어와 용어마다 채울 언어·참고 번역·예문 */
export function buildTermTranslateBatchPrompt(items: readonly TermTranslateItem[]): string {
  const languages = [...new Set(items.flatMap((item) => item.translateTo))]
  const terms = items.map((item) => {
    const entry: Record<string, unknown> = { term: item.term }
    if (item.pos.trim()) entry['pos'] = item.pos.trim()
    if (item.note.trim()) entry['note'] = item.note.trim()
    entry['translate_to'] = item.translateTo
    const known = Object.fromEntries(Object.entries(item.known).filter(([, text]) => text.trim() !== ''))
    if (Object.keys(known).length > 0) entry['known_translations'] = known
    if (item.found === 0) {
      entry['examples'] = 'not found in the source strings; rely on the game description'
    } else {
      entry['examples'] = item.examples.map((example) => {
        const row: Record<string, unknown> = { key: example.key, source: example.source }
        if (example.context) row['context'] = example.context
        if (Object.keys(example.translations).length > 0) row['translations'] = example.translations
        return row
      })
      if (item.found > item.examples.length) entry['examples_shown'] = `${item.examples.length} of ${item.found}`
    }
    return entry
  })
  return [
    section('Languages', languages.map(languageLabel).join('\n')),
    '',
    `# Terms (${items.length})`,
    JSON.stringify(terms, null, 1)
  ].join('\n')
}

/** 도구가 받는 항목 하나. 도구 입력 스키마로도 쓴다 */
export const SubmittedTermTranslation = z.object({
  term: z.string().min(1),
  translations: z.array(z.object({ language: z.string(), text: z.string() })),
  reason: z.string().optional(),
  confidence: z.number().min(0).max(1)
})
export type SubmittedTermTranslation = z.infer<typeof SubmittedTermTranslation>

/** 도구 입력 모양(zod raw shape) */
export const TERM_TRANSLATIONS_INPUT_SHAPE = { terms: z.array(SubmittedTermTranslation) }

/** 받은 번역. term 은 용어집 표기, translations 는 채울 언어만 */
export type TermTranslationResult = {
  term: string
  translations: Record<string, string>
  reason: string
  confidence: number
}

/**
 * 제출을 판정한다. 배치의 용어를 빠짐없이 한 번씩 내야 하고(대소문자 무시), 채울 언어마다 번역이 있어야 한다.
 * 채울 언어가 아닌 번역은 조용히 버린다(이미 있는 번역은 덮지 않는다).
 * 첫 제출의 문제는 돌려줘 한 번 고치게 하고, 마지막 제출은 문제없는 용어만 받는다 — 버린 용어는 칸이 빈 채로 남아
 * 다시 실행하면 그 용어만 돈다. 받을 용어가 하나도 없으면 거부한다.
 */
export function judgeTermTranslations(input: {
  items: readonly SubmittedTermTranslation[]
  targets: readonly TermTranslateTarget[]
  final: boolean
}): SubmitVerdict<TermTranslationResult> {
  const byKey = new Map(input.targets.map((target) => [termKey(target.term), target]))
  const seen = new Set<string>()
  const valid: TermTranslationResult[] = []
  const issues: string[] = []

  for (const item of input.items) {
    const key = termKey(item.term)
    const target = byKey.get(key)
    if (!target) {
      issues.push(`"${item.term}": not in this batch`)
      continue
    }
    if (seen.has(key)) {
      issues.push(`"${item.term}": duplicate`)
      continue
    }
    seen.add(key)
    const given = new Map(item.translations.map((entry) => [entry.language, entry.text.trim()]))
    const missing = target.languages.filter((language) => (given.get(language) ?? '') === '')
    if (missing.length > 0) {
      issues.push(`"${target.term}": missing translations: ${missing.join(', ')}`)
      continue
    }
    valid.push({
      term: target.term,
      translations: Object.fromEntries(target.languages.map((language) => [language, given.get(language) ?? ''])),
      reason: (item.reason ?? '').trim(),
      confidence: item.confidence
    })
  }
  const absent = input.targets.filter((target) => !seen.has(termKey(target.term))).map((target) => `"${target.term}"`)
  if (absent.length > 0) issues.push(`missing terms: ${absent.join(', ')}`)
  return settleItems(valid, issues, input.final, true)
}

export type FillTranslationsResult = {
  records: Record<string, string>[]
  /** 채운 용어와 언어 */
  filled: { term: string; languages: string[] }[]
  /** 용어가 사라졌거나 그 사이 칸이 채워져 아무것도 넣지 않은 용어 */
  skipped: string[]
}

/**
 * 받은 번역으로 빈 칸만 채운다. 순수 함수 — 파일은 호출한 쪽이 다시 읽어 넘기고 쓴다.
 * 그 사이 사람이 채운 칸은 덮지 않는다. 승인된 용어에 채운 언어는 pending_languages 에 넣어 승인을 기다리게 한다
 * (사용자 결정, 2026-11-02 — 다른 언어의 확정 번역은 계속 쓰인다). 승인 대기 용어는 용어 전체 승인으로 함께 확정된다.
 */
export function fillTermTranslations(
  records: readonly Readonly<Record<string, string>>[],
  results: readonly Pick<TermTranslationResult, 'term' | 'translations'>[]
): FillTranslationsResult {
  const next: Record<string, string>[] = records.map((record) => ({ ...record }))
  const filled: FillTranslationsResult['filled'] = []
  const skipped: string[] = []

  for (const result of results) {
    const key = termKey(result.term)
    const record = next.find((item) => termKey(item['term'] ?? '') === key)
    if (!record) {
      skipped.push(result.term)
      continue
    }
    const approved = glossaryStatusOf(record['status'] ?? '') === 'approved'
    const pending = parsePendingLanguages(record[PENDING_LANGUAGES_COLUMN] ?? '')
    const languages: string[] = []
    for (const [language, text] of Object.entries(result.translations)) {
      const column = translationColumn(language)
      if ((record[column] ?? '').trim() !== '' || text.trim() === '') continue
      record[column] = text.trim()
      languages.push(language)
      if (approved && !pending.includes(language)) pending.push(language)
    }
    if (languages.length === 0) {
      skipped.push(result.term)
      continue
    }
    if (approved) record[PENDING_LANGUAGES_COLUMN] = formatPendingLanguages(pending)
    filled.push({ term: (record['term'] ?? '').trim(), languages })
  }
  return { records: next, filled, skipped }
}
