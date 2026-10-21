import type { ProjectConfig } from '@shared/schema/project'
import type { MasterRow } from '@shared/schema/strings'
import type { GlossaryTerm } from './glossary'

/** 제출 도구 이름. MCP 서버에 붙일 때와 프롬프트에서 같은 값을 쓴다. */
export const SUBMIT_TOOL = 'submit_translations'

function languageLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code)
    return name && name !== code ? `${code} (${name})` : code
  } catch {
    return code
  }
}

function section(title: string, body: string): string {
  return `# ${title}\n${body.trim() === '' ? '(not provided)' : body.trim()}`
}

/**
 * 고정 부분. 프로젝트 설정과 대상 언어가 같으면 문자 하나까지 같아야 한다(프롬프트 캐싱).
 * 시각·배치 번호·진행률처럼 매번 바뀌는 값을 넣지 않는다. 스타일 규칙은 id 순으로 정렬한다.
 */
export function buildSystemPrompt(config: ProjectConfig, language: string): string {
  const rules = [...config.styleRules]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((rule) => `- ${rule.text}`)
    .join('\n')

  return [
    'You are a professional game localization translator.',
    `Translate each source string from ${languageLabel(config.sourceLanguage)} into ${languageLabel(language)}.`,
    '',
    'Rules:',
    '- Keep every placeholder exactly as in the source: {name}, {0}, Smart String syntax such as {count:plural:...}, and rich text tags such as <color=#fff>...</color>. Do not translate, add, or remove them.',
    '- When max_len is given, the final text must not exceed that many characters.',
    '- When a glossary term appears, use its fixed translation.',
    '- Follow the tone guide and style rules below.',
    '- If you are unsure, still translate, lower confidence, and explain why in note.',
    '- confidence is a number from 0 to 1.',
    '',
    'Output:',
    `- Call the ${SUBMIT_TOOL} tool exactly once with one entry for every key in the batch. Do not answer with text.`,
    '- If the tool reports problems, fix them and call it one more time.',
    '',
    section('Game', [config.game.intro, config.game.genre ? `Genre: ${config.game.genre}` : ''].filter(Boolean).join('\n')),
    '',
    section('Tone guide', config.game.toneGuide),
    '',
    section('Style rules', rules)
  ].join('\n')
}

/** 가변 부분. 이번 배치의 문자열과, 그 문자열에 나오는 용어만 담는다. */
export function buildBatchPrompt(rows: readonly MasterRow[], terms: readonly GlossaryTerm[]): string {
  const glossary =
    terms.length === 0
      ? '(none)'
      : terms
          .map((term) => {
            const note = term.note ? ` — ${term.note}` : ''
            const fixed = term.translation ? ` → ${term.translation}` : ''
            return `- ${term.term}${fixed}${note}`
          })
          .join('\n')

  // 비어 있는 열은 빼서 토큰을 아낀다
  const strings = rows.map((row) => {
    const item: Record<string, string> = { key: row.key, source: row.source }
    if (row.context) item['context'] = row.context
    if (row.ui_type) item['ui_type'] = row.ui_type
    if (row.max_len) item['max_len'] = row.max_len
    if (row.vars) item['vars'] = row.vars
    return item
  })

  return [
    '# Glossary',
    glossary,
    '',
    `# Strings (${rows.length})`,
    JSON.stringify(strings, null, 1)
  ].join('\n')
}
