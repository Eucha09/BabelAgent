import type { Messages } from '@shared/i18n'
import type { QaDiagnostic, QaRuleId, QaSeverity } from '@shared/schema/qa'
import type { TranslationStatus } from '@shared/schema/project'
import { findGlossaryViolations, type QaGlossaryTerm } from './glossary'
import { measureDisplayLength, parseMaxLen } from './length'
import { formatterNames, parseSmart, type BraceProblem, type SmartStringsSettings } from './smart'
import { checkTagStructure, compareTagSets, scanTags, structureProblemsBeyondSource, tagIds } from './tags'
import { compareVariables, examplesByName, extractVariables, normalizeName, parseVarsMeta } from './vars'

/** 규칙별 심각도. glossary.violation 은 용어의 strict 에 따라 _strict 로 바뀐다. */
export const RULE_SEVERITY: Readonly<Record<QaRuleId, QaSeverity>> = {
  'var.missing': 'error',
  'var.extra': 'error',
  'var.meta_mismatch': 'warning',
  'var.meta_invalid': 'warning',
  'smart.brace_unbalanced': 'error',
  'smart.unknown_formatter': 'warning',
  'tag.set_mismatch': 'error',
  'tag.unclosed': 'error',
  'len.over_max': 'error',
  'text.empty': 'error',
  'glossary.violation': 'warning',
  'glossary.violation_strict': 'error',
  'status.stale': 'warning'
}

/**
 * 게임에서 문자열을 깨뜨리는 오류. 배치 제출에서 이 오류가 수정 뒤에도 남으면 배치를 거부한다.
 * 길이 초과와 strict 용어 위반은 오류지만 기록은 하고 검토 화면에 띄운다(내보내기가 막는다).
 */
export const STRUCTURAL_RULES: ReadonlySet<QaRuleId> = new Set<QaRuleId>([
  'var.missing',
  'var.extra',
  'smart.brace_unbalanced',
  'tag.set_mismatch',
  'tag.unclosed'
])

export type QaContext = {
  smart: SmartStringsSettings
  sourceLanguage: string
  targetLanguage: string
  /** 승인된 용어. 확정 번역이 빈 용어는 검사에서 빠진다. */
  glossary: readonly QaGlossaryTerm[]
}

export type QaRowInput = {
  key: string
  source: string
  /** 현재 원문의 해시 */
  sourceHash: string
  maxLen: string
  vars: string
  /** 번역 파일에 행이 없으면 null */
  translation: { text: string; status: TranslationStatus; sourceHash: string } | null
}

function diagnostic(
  ruleId: QaRuleId,
  key: string,
  message: string,
  items: string[] = [],
  detail?: string
): QaDiagnostic {
  const base = { ruleId, severity: RULE_SEVERITY[ruleId], key, message, items }
  return detail === undefined ? base : { ...base, detail }
}

const braces = (names: readonly string[]): string => names.map((name) => `{${name}}`).join(', ')
const angles = (ids: readonly string[]): string => ids.map((id) => `<${id}>`).join(', ')

function describeBraceProblems(text: string, problems: readonly BraceProblem[], t: Messages): string {
  return problems
    .map((problem) => {
      const around = text.slice(Math.max(0, problem.index - 8), problem.index + 9).replace(/\n/g, '⏎')
      const what = problem.kind === 'unclosed' ? t.qa.unclosedBrace : t.qa.orphanBrace
      return t.qa.braceAt(what, problem.index + 1, around)
    })
    .join('\n')
}

/** 원문 쪽 검사. 번역과 상관없이 vars 열이 원문과 맞는지 본다. */
function checkSourceMeta(row: QaRowInput, ctx: QaContext, sourceVars: readonly string[], t: Messages): QaDiagnostic[] {
  const meta = parseVarsMeta(row.vars)
  if (!meta.ok) {
    return [diagnostic('var.meta_invalid', row.key, t.qa.varsUnreadable, [], meta.reason)]
  }
  // 빈 vars 는 "메타데이터 없음". 쓰지 않는 프로젝트에서 모든 행이 경고로 덮이지 않게 한다.
  if (row.vars.trim() === '') return []

  const { caseSensitive } = ctx.smart
  const diff = compareVariables(
    sourceVars,
    meta.items.map((item) => item.name),
    caseSensitive
  )
  if (diff.missing.length === 0 && diff.extra.length === 0) return []
  const parts = [
    diff.missing.length > 0 ? t.qa.onlyInSource(braces(diff.missing)) : '',
    diff.extra.length > 0 ? t.qa.onlyInVars(diff.extra.join(', ')) : ''
  ].filter((part) => part !== '')
  return [
    diagnostic(
      'var.meta_mismatch',
      row.key,
      t.qa.varsMismatch,
      [...diff.missing, ...diff.extra],
      `${parts.join(' · ')}\n${t.qa.varsMismatchHint}`
    )
  ]
}

/** 행 하나를 검사한다. 순서는 원문 메타 → 빈 번역 → stale → 중괄호·변수 → 태그 → 길이 → 용어집. */
export function checkRow(row: QaRowInput, ctx: QaContext, t: Messages): QaDiagnostic[] {
  const { smart } = ctx
  const sourceParse = parseSmart(row.source, smart)
  const sourceVars = extractVariables(sourceParse.tokens)
  const results = checkSourceMeta(row, ctx, sourceVars, t)

  const translation = row.translation
  if (!translation) return results
  const text = translation.text
  if (text.trim() === '') {
    if (translation.status !== 'untranslated') {
      results.push(diagnostic('text.empty', row.key, t.qa.empty))
    }
    return results
  }

  if (translation.status === 'stale' || translation.sourceHash !== row.sourceHash) {
    results.push(diagnostic('status.stale', row.key, t.qa.stale))
  }

  // 중괄호와 변수
  const parsed = parseSmart(text, smart)
  if (parsed.problems.length > 0) {
    results.push(
      diagnostic(
        'smart.brace_unbalanced',
        row.key,
        t.qa.braces,
        parsed.problems.map((problem) => `${problem.kind}@${problem.index}`),
        describeBraceProblems(text, parsed.problems, t)
      )
    )
  }

  const variables = compareVariables(sourceVars, extractVariables(parsed.tokens), smart.caseSensitive)
  if (variables.missing.length > 0) {
    results.push(diagnostic('var.missing', row.key, t.qa.missingVars(braces(variables.missing)), variables.missing))
  }
  if (variables.extra.length > 0) {
    results.push(diagnostic('var.extra', row.key, t.qa.extraVars(braces(variables.extra)), variables.extra))
  }

  if (smart.enabled) {
    const allowed = new Set(smart.formatters.map((name) => normalizeName(name, smart.caseSensitive)))
    const unknown = [...new Set(formatterNames(parsed.tokens))].filter(
      (name) => !allowed.has(normalizeName(name, smart.caseSensitive))
    )
    if (unknown.length > 0) {
      results.push(
        diagnostic(
          'smart.unknown_formatter',
          row.key,
          t.qa.unknownFormatters(unknown.join(', ')),
          unknown,
          t.qa.unknownFormattersHint
        )
      )
    }
  }

  // 태그
  const sourceTags = scanTags(row.source)
  const translationTags = scanTags(text)
  const tagDiff = compareTagSets(tagIds(sourceTags), tagIds(translationTags))
  if (tagDiff.missing.length > 0 || tagDiff.extra.length > 0) {
    const parts = [
      tagDiff.missing.length > 0 ? t.qa.tagsMissing(angles(tagDiff.missing)) : '',
      tagDiff.extra.length > 0 ? t.qa.tagsExtra(angles(tagDiff.extra)) : ''
    ].filter((part) => part !== '')
    results.push(
      diagnostic('tag.set_mismatch', row.key, t.qa.tagsMismatch, [...tagDiff.missing, ...tagDiff.extra], parts.join(' · '))
    )
  }
  const structure = structureProblemsBeyondSource(checkTagStructure(sourceTags), checkTagStructure(translationTags))
  const structureParts = [
    structure.unclosed.length > 0 ? t.qa.tagsUnclosed(angles(structure.unclosed)) : '',
    structure.orphanClosers.length > 0 ? t.qa.tagsOrphan(structure.orphanClosers.map((name) => `</${name}>`).join(', ')) : '',
    structure.crossed.length > 0 ? t.qa.tagsCrossed(angles(structure.crossed)) : ''
  ].filter((part) => part !== '')
  if (structureParts.length > 0) {
    results.push(
      diagnostic(
        'tag.unclosed',
        row.key,
        t.qa.tagsUnpaired,
        [...structure.unclosed, ...structure.orphanClosers, ...structure.crossed],
        structureParts.join(' · ')
      )
    )
  }

  // 길이
  const maxLen = parseMaxLen(row.maxLen)
  if (maxLen !== null) {
    const meta = parseVarsMeta(row.vars)
    const examples = examplesByName(meta.ok ? meta.items : [], smart.caseSensitive)
    const measured = measureDisplayLength(text, smart, examples, smart.caseSensitive)
    if (measured.length > maxLen) {
      const assumptions = measured.assumptions.map((item) =>
        item.example === null ? t.qa.noExample(item.name) : t.qa.example(item.name, item.example)
      )
      const detail = [t.qa.lengthRule, ...assumptions].join('\n')
      results.push(
        diagnostic('len.over_max', row.key, t.qa.tooLong(measured.length, maxLen), [`${measured.length}/${maxLen}`], detail)
      )
    }
  }

  // 용어집
  const violations = findGlossaryViolations(row.source, text, ctx.glossary, {
    source: ctx.sourceLanguage,
    target: ctx.targetLanguage
  })
  for (const violation of violations) {
    results.push(
      diagnostic(
        violation.strict ? 'glossary.violation_strict' : 'glossary.violation',
        row.key,
        t.qa.glossary(violation.term, violation.translation),
        [`${violation.term} → ${violation.translation}`]
      )
    )
  }

  return results
}

export function hasErrors(diagnostics: readonly QaDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'error')
}
