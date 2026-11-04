import { useMemo, useState } from 'react'
import { termKey } from '@core/glossary/entries'
import { findTranslateTargets, TERMS_PER_BATCH } from '@core/terms/translation'
import { clampConcurrency } from '@core/translate/batches'
import type { GlossaryEntry, StartTermTranslateInput, TermsScope } from '@shared/schema/glossary'
import type { ProjectConfig } from '@shared/schema/project'
import { useT } from '../i18n'

type Props = {
  config: ProjectConfig
  /** 파일에서 읽은 항목(고친 칸 말고) */
  entries: readonly GlossaryEntry[]
  languages: readonly string[]
  /** 그리드에서 고른 용어 */
  chosenTerms: readonly string[]
  disabled: boolean
  /** 다른 작업이 도는 중이면 그 이름 */
  blockedBy: string | null
  onStart: (input: StartTermTranslateInput) => void
}

/**
 * 용어집 화면의 "용어 번역" 카드. 고른 언어의 빈 칸만 에이전트로 채운다(덮어쓰기는 [선택 재번역]).
 * 언어를 따로 고르지 않으면 빈 칸이 있는 언어를 모두 고른 것으로 본다 — 대상 언어를 늘린 뒤 바로 누르면 되게.
 */
export function TermTranslateCard({ config, entries, languages, chosenTerms, disabled, blockedBy, onStart }: Props): React.JSX.Element {
  const t = useT()
  const [scope, setScope] = useState<TermsScope>('all')
  /** null 이면 빈 칸이 있는 언어 전부 */
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null)

  const scoped = useMemo(() => {
    if (scope === 'all') return entries
    const keys = new Set(chosenTerms.map(termKey))
    return entries.filter((entry) => keys.has(termKey(entry.term)))
  }, [chosenTerms, entries, scope])

  const emptyCounts = useMemo(
    () => new Map(languages.map((language) => [language, findTranslateTargets(scoped, [language]).length])),
    [languages, scoped]
  )
  const effective = useMemo(
    () => languages.filter((language) => (picked ? picked.has(language) : (emptyCounts.get(language) ?? 0) > 0)),
    [emptyCounts, languages, picked]
  )
  const targets = useMemo(() => findTranslateTargets(scoped, effective), [effective, scoped])
  const cells = targets.reduce((sum, target) => sum + target.languages.length, 0)
  const batches = Math.ceil(targets.length / TERMS_PER_BATCH)

  const toggle = (language: string, on: boolean): void => {
    const next = new Set(effective)
    if (on) next.add(language)
    else next.delete(language)
    setPicked(next)
  }

  return (
    <section className="card">
      <h3>{t.termTranslate.title}</h3>
      {languages.length === 0 ? (
        <p className="hint">{t.common.setTargetLanguages}</p>
      ) : (
        <div className="check-row" style={{ margin: '0 0 var(--space-2)' }}>
          {languages.map((language) => (
            <label key={language} className="check">
              <input
                type="checkbox"
                checked={effective.includes(language)}
                disabled={disabled}
                onChange={(event) => toggle(language, event.target.checked)}
              />
              <code>{language}</code>
              <span className="scope-count">{t.termTranslate.emptyCells(emptyCounts.get(language) ?? 0)}</span>
            </label>
          ))}
        </div>
      )}
      <div className="scope-options">
        <label className={scope === 'all' ? 'scope-option selected' : 'scope-option'}>
          <input type="radio" name="term-translate-scope" checked={scope === 'all'} disabled={disabled} onChange={() => setScope('all')} />
          <span>{t.termTranslate.scopeAll}</span>
          <span className="scope-count">{entries.length}</span>
        </label>
        <label className={scope === 'selected' ? 'scope-option selected' : 'scope-option'}>
          <input
            type="radio"
            name="term-translate-scope"
            checked={scope === 'selected'}
            disabled={disabled}
            onChange={() => setScope('selected')}
          />
          <span>{t.termTranslate.scopeSelected}</span>
          <span className="scope-count">{chosenTerms.length}</span>
        </label>
      </div>
      <p className="hint">
        {[
          t.translateOptions.summary(t.translateOptions.model[config.translate.model], t.translateOptions.effort[config.translate.effort]),
          t.translateOptions.termBatch(TERMS_PER_BATCH),
          t.translateOptions.workers(clampConcurrency(config.batch.concurrency))
        ].join(' · ')}
      </p>
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <button
          type="button"
          className="primary"
          disabled={disabled || targets.length === 0}
          onClick={() => onStart({ languages: effective, scope, terms: scope === 'selected' ? [...chosenTerms] : [] })}
        >
          {t.termTranslate.start}
        </button>
        <span className="hint">
          {targets.length > 0 ? t.termTranslate.plan(targets.length, cells, batches) : t.termTranslate.nothing}
          {blockedBy ? t.job.busyWith(blockedBy) : ''}
        </span>
      </div>
    </section>
  )
}
