import type { ProjectConfig, StyleRule } from '@shared/schema/project'
import type { TranslateEffort, TranslateModel } from '@shared/schema/jobs'
import { validateProjectSettings, type SettingsProblem } from './settings'

/**
 * 프로젝트 화면의 입력 상태. 숫자 칸은 입력 중에 비거나 잘못될 수 있으므로 글자로 들고 있다가
 * 저장할 때 숫자로 바꾼다. 목록 칸(대상 언어, 포매터)은 쉼표·줄바꿈으로 나눈 글자다.
 */
export type ProjectForm = {
  name: string
  sourceLanguage: string
  targetLanguages: string
  genre: string
  intro: string
  toneGuide: string
  styleRules: StyleRule[]
  model: TranslateModel
  effort: TranslateEffort
  maxRows: string
  maxSourceChars: string
  concurrency: string
  lowConfidence: string
  maxLenRatio: string
  smartEnabled: boolean
  formatters: string
  alternativeEscaping: boolean
  escapeChar: string
  convertCharacterStringLiterals: boolean
  caseSensitive: boolean
}

export function toProjectForm(config: ProjectConfig): ProjectForm {
  return {
    name: config.name,
    sourceLanguage: config.sourceLanguage,
    targetLanguages: config.targetLanguages.join(', '),
    genre: config.game.genre,
    intro: config.game.intro,
    toneGuide: config.game.toneGuide,
    styleRules: config.styleRules.map((rule) => ({ ...rule })),
    model: config.translate.model,
    effort: config.translate.effort,
    maxRows: String(config.batch.maxRows),
    maxSourceChars: String(config.batch.maxSourceChars),
    concurrency: String(config.batch.concurrency),
    lowConfidence: String(config.review.lowConfidence),
    maxLenRatio: String(config.context.maxLenRatio),
    smartEnabled: config.smartStrings.enabled,
    formatters: config.smartStrings.formatters.join(', '),
    alternativeEscaping: config.smartStrings.alternativeEscaping,
    escapeChar: config.smartStrings.escapeChar,
    convertCharacterStringLiterals: config.smartStrings.convertCharacterStringLiterals,
    caseSensitive: config.smartStrings.caseSensitive
  }
}

/** 쉼표·줄바꿈·공백으로 나눈 목록. 빈 항목은 뺀다. */
export function splitList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/** 숫자 칸. 비었거나 숫자가 아니면 NaN — 검증이 칸 옆에 오류를 띄운다. */
function toNumber(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? Number.NaN : Number(trimmed)
}

/**
 * 입력을 설정으로 바꾸고 문제를 모은다. base 는 화면을 연 시점의 설정 — 화면에 없는 항목
 * (schemaVersion, grammar, export)은 거기서 가져온다.
 */
export function fromProjectForm(form: ProjectForm, base: ProjectConfig): { config: ProjectConfig; problems: SettingsProblem[] } {
  const config: ProjectConfig = {
    ...base,
    name: form.name.trim(),
    sourceLanguage: form.sourceLanguage.trim(),
    targetLanguages: splitList(form.targetLanguages),
    game: { genre: form.genre.trim(), intro: form.intro, toneGuide: form.toneGuide },
    styleRules: form.styleRules.map((rule) => ({ ...rule, text: rule.text.trim() })),
    translate: { model: form.model, effort: form.effort },
    batch: {
      maxRows: toNumber(form.maxRows),
      maxSourceChars: toNumber(form.maxSourceChars),
      concurrency: toNumber(form.concurrency)
    },
    review: { lowConfidence: toNumber(form.lowConfidence) },
    context: { maxLenRatio: toNumber(form.maxLenRatio) },
    smartStrings: {
      enabled: form.smartEnabled,
      formatters: splitList(form.formatters),
      alternativeEscaping: form.alternativeEscaping,
      escapeChar: form.escapeChar,
      convertCharacterStringLiterals: form.convertCharacterStringLiterals,
      caseSensitive: form.caseSensitive
    }
  }
  return { config, problems: validateProjectSettings(config) }
}
