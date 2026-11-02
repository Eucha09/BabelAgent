import { useMemo, useState } from 'react'
import { termKey } from '@core/glossary/entries'
import { findTranslateTargets, TERMS_PER_BATCH } from '@core/terms/translation'
import { clampConcurrency } from '@core/translate/batches'
import type { GlossaryEntry, StartTermTranslateInput, TermsScope } from '@shared/schema/glossary'
import type { ProjectConfig } from '@shared/schema/project'
import { effortLabel, modelLabel } from '../state/translate-options'

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
      <h3>용어 번역</h3>
      {languages.length === 0 ? (
        <p className="hint">대상 언어가 없습니다. 프로젝트 화면에서 정하세요.</p>
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
              <span className="scope-count">빈 칸 {emptyCounts.get(language) ?? 0}</span>
            </label>
          ))}
        </div>
      )}
      <div className="scope-options">
        <label className={scope === 'all' ? 'scope-option selected' : 'scope-option'}>
          <input type="radio" name="term-translate-scope" checked={scope === 'all'} disabled={disabled} onChange={() => setScope('all')} />
          <span>빈 칸 전체</span>
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
          <span>선택한 용어</span>
          <span className="scope-count">{chosenTerms.length}</span>
        </label>
      </div>
      <p className="hint">
        모델 {modelLabel(config.translate.model)} · 사고 {effortLabel(config.translate.effort)} · 배치 용어 {TERMS_PER_BATCH}개 ·
        작업자 {clampConcurrency(config.batch.concurrency)}
      </p>
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <button
          type="button"
          className="primary"
          disabled={disabled || targets.length === 0}
          onClick={() => onStart({ languages: effective, scope, terms: scope === 'selected' ? [...chosenTerms] : [] })}
        >
          번역 시작
        </button>
        <span className="hint">
          {targets.length > 0 ? `용어 ${targets.length}개 · 칸 ${cells}개 · 배치 ${batches}개` : '고른 언어에 빈 칸이 없습니다'}
          {blockedBy ? ` — ${blockedBy} 중` : ''}
        </span>
      </div>
    </section>
  )
}
