import type { ProjectConfig } from '@shared/schema/project'
import type { MasterRow } from '@shared/schema/strings'
import { gameSection, languageLabel, section } from '../translate/prompt'

/** 제출 도구 이름. MCP 서버에 붙일 때와 프롬프트에서 같은 값을 쓴다. */
export const TERMS_TOOL = 'submit_terms'

/**
 * 용어 추출의 고정 부분. 프로젝트 설정이 같으면 문자 하나까지 같다(프롬프트 캐싱).
 * 후보만 찾는다. 번역은 용어 번역 작업이 따로 한다 — 대상 언어를 늘려도 다시 추출하지 않고 빈 칸만 채우게
 * (사용자 결정, 2026-11-02. 그 전에는 추출하면서 번역 제안도 받았다). 대상 언어도 넣지 않아 언어를 바꿔도 캐시가 남는다.
 */
export function buildTermsSystemPrompt(config: ProjectConfig): string {
  const source = languageLabel(config.sourceLanguage)
  return [
    'You are a terminology specialist for game localization.',
    `Find glossary candidates in the ${source} source strings: terms that must be translated the same way everywhere.`,
    '',
    'What to extract:',
    '- Proper nouns: names of characters, places, factions, and items.',
    '- Game-specific terms: skills, stats, currencies, game modes, and mechanics.',
    '- Recurring UI terms that should stay consistent across screens.',
    'Do not extract ordinary words, whole sentences, placeholders such as {name}, or rich text tags.',
    'Do not translate the terms. Translations are added in a separate step.',
    '',
    'For each candidate:',
    '- term: exactly as written in the source strings, in its base form without attached particles or endings.',
    '- pos: a short category such as character, place, item, skill, stat, ui, or noun.',
    `- note: an optional usage rule for translators, such as "keep in Latin letters" or "do not translate". Write it in ${source}.`,
    `- reason: why this should be a glossary term. Write it in ${source}.`,
    '- confidence: 0 to 1.',
    '',
    'Output:',
    `- Call the ${TERMS_TOOL} tool exactly once. Submit an empty list if there are no new terms. Do not answer with text.`,
    '- Skip the terms listed under "Already in glossary".',
    '- If the tool reports problems, fix them and call it one more time.',
    '',
    gameSection(config)
  ].join('\n')
}

/** 가변 부분. 이번 배치의 문자열과, 그 문자열에 이미 있는 용어집 용어. */
export function buildTermsBatchPrompt(rows: readonly MasterRow[], knownTerms: readonly string[]): string {
  const strings = rows.map((row) => {
    const item: Record<string, string> = { key: row.key, source: row.source }
    if (row.context) item['context'] = row.context
    return item
  })
  return [
    section('Already in glossary', knownTerms.map((term) => `- ${term}`).join('\n') || '(none)'),
    '',
    `# Strings (${rows.length})`,
    JSON.stringify(strings, null, 1)
  ].join('\n')
}
