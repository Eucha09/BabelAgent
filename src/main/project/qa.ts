import { checkRow, type QaContext, type QaRowInput } from '@core/qa/check'
import type { GlossaryTerm } from '@core/translate/glossary'
import type { OpenProject, ProjectConfig } from '@shared/schema/project'
import type { QaDiagnostic, QaReport } from '@shared/schema/qa'
import type { MasterRow, TranslationRow } from '@shared/schema/strings'
import { ok, type IpcResult } from '@shared/types'
import { loadGlossaryTerms, loadMaster, loadTranslations } from './store'
import { msg } from '../i18n'

export function toQaInput(
  master: MasterRow,
  translation: Pick<TranslationRow, 'text' | 'status' | 'source_hash'> | undefined
): QaRowInput {
  return {
    key: master.key,
    source: master.source,
    sourceHash: master.source_hash,
    maxLen: master.max_len,
    vars: master.vars,
    translation: translation
      ? { text: translation.text, status: translation.status, sourceHash: translation.source_hash }
      : null
  }
}

export function qaContext(config: ProjectConfig, language: string, glossary: readonly GlossaryTerm[]): QaContext {
  return {
    smart: config.smartStrings,
    sourceLanguage: config.sourceLanguage,
    targetLanguage: language,
    glossary
  }
}

/** 용어집까지 읽어 검사 문맥을 만든다. 용어집을 못 읽으면 용어 검사만 빼고 알린다. */
export function loadQaContext(project: OpenProject, language: string): { ctx: QaContext; notices: string[] } {
  const glossary = loadGlossaryTerms(project.dir, language)
  const notices = glossary.ok ? [] : [msg().errors.glossaryUnreadableQa(glossary.error.message)]
  return { ctx: qaContext(project.config, language, glossary.ok ? glossary.value : []), notices }
}

/** 언어 하나의 모든 행을 검사한다. 진단이 있는 키만 담는다. */
export function runQa(project: OpenProject, language: string): IpcResult<QaReport> {
  const master = loadMaster(project.dir)
  if (!master.ok) return master
  const translations = loadTranslations(project.dir, language)
  if (!translations.ok) return translations

  const { ctx, notices } = loadQaContext(project, language)
  const byKey = new Map(translations.value.rows.map((row) => [row.key, row]))
  const diagnostics: Record<string, QaDiagnostic[]> = {}
  for (const row of master.value.rows) {
    const found = checkRow(toQaInput(row, byKey.get(row.key)), ctx, msg())
    if (found.length > 0) diagnostics[row.key] = found
  }
  return ok({ language, diagnostics, notices })
}
