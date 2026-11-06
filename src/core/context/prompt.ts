import type { ProjectConfig } from '@shared/schema/project'
import { DISPLAY_LENGTH_RULE, gameSection, languageLabel, section } from '../translate/prompt'
import type { ContextTarget } from './targets'

/** 제출 도구 이름. MCP 서버에 붙일 때와 프롬프트에서 같은 값을 쓴다. */
export const CONTEXT_TOOL = 'submit_context'

/**
 * 컨텍스트 추정의 고정 부분. 프로젝트 설정이 같으면 문자 하나까지 같다(프롬프트 캐싱).
 * 사람이 읽을 글(context, 변수 meaning, note)은 원문 언어로 쓰게 한다 — 원문을 쓰는 사람이 검토한다.
 */
export function buildContextSystemPrompt(config: ProjectConfig): string {
  const source = languageLabel(config.sourceLanguage)
  const targets = config.targetLanguages.map(languageLabel).join(', ') || 'the target languages'
  return [
    'You are a localization assistant preparing the source strings of a game for translation.',
    'For each string, fill in the requested metadata so that translators understand where and how the text is used.',
    '',
    'Fields:',
    `- context: one or two sentences on where the text appears, who says it, or what it refers to. Write it in ${source}.`,
    '- ui_type: a short lowercase category such as dialogue, button, tooltip, item_name, title, label, description, message, or system. Reuse the categories already used in the project when they fit.',
    `- max_len: the maximum display length in characters of the translated text, in every target language (${targets}), not of the source. Give it only for short UI text whose space is clearly limited (buttons, tabs, short labels). Omit it otherwise.`,
    '- Be generous with max_len. Translations are often much longer than the source, so estimate the longest natural translation among the target languages and add room on top of it. It is a guard against overflow, not a target length; when unsure, choose the larger value.',
    DISPLAY_LENGTH_RULE,
    `- vars: for every listed variable name, its type (string, int, float, ...), meaning, and a realistic example value. Use the names exactly as listed. Write meaning in ${source}.`,
    '',
    'Rules:',
    '- Fill only the fields listed in "fill" for each key. The other fields are already set; use them as clues.',
    '- Use keys, tags, and neighboring strings as clues. Key names often encode the screen or feature.',
    `- confidence (0 to 1) is how sure you are about the whole entry. If you are guessing, lower it and explain why in note, written in ${source}.`,
    '',
    'Output:',
    `- Call the ${CONTEXT_TOOL} tool exactly once with one entry for every key. Do not answer with text.`,
    '- If the tool reports problems, fix them and call it one more time.',
    '',
    gameSection(config)
  ].join('\n')
}

/** 가변 부분. 이번 배치의 문자열과 채울 필드, 프로젝트에서 이미 쓰는 ui_type. */
export function buildContextBatchPrompt(targets: readonly ContextTarget[], uiTypes: readonly string[]): string {
  // 비어 있는 열은 빼서 토큰을 아낀다
  const strings = targets.map(({ row, fill, variables }) => {
    const item: Record<string, unknown> = { key: row.key, source: row.source }
    if (row.context) item['context'] = row.context
    if (row.ui_type) item['ui_type'] = row.ui_type
    if (row.max_len) item['max_len'] = row.max_len
    if (row.tags) item['tags'] = row.tags
    item['fill'] = fill
    if (fill.includes('vars')) item['variables'] = variables
    return item
  })
  return [
    section('UI types already used in this project', uiTypes.length > 0 ? uiTypes.join(', ') : '(none yet)'),
    '',
    `# Strings (${targets.length})`,
    JSON.stringify(strings, null, 1)
  ].join('\n')
}
