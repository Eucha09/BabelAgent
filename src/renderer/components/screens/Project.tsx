import { useEffect, useMemo, useRef, useState } from 'react'
import { fromProjectForm, toProjectForm, type ProjectForm } from '@core/project/form'
import { MIN_SUGGESTED_MAX_LEN } from '@core/context/submission'
import { defaultColumnName } from '@core/export/locales'
import { findTranslateTargets } from '@core/terms/translation'
import {
  buildSettingsPatch,
  isLanguageTag,
  MAX_LEN_RATIO_LIMIT,
  nextStyleRuleId,
  type SettingsField,
  type SettingsProblem
} from '@core/project/settings'
import { TranslateEffort, TranslateModel } from '@shared/schema/jobs'
import { MAX_CONCURRENCY, type OpenProject, type ProjectConfig, type ProjectSettingsPatch } from '@shared/schema/project'
import type { IpcError, IpcResult } from '@shared/types'
import type { Messages } from '@shared/i18n'
import { useT } from '../../i18n'
import { EFFORT_VALUES, MODEL_VALUES } from '../../state/translate-options'
import { LanguageMultiSelect, LanguageSelect } from '../LanguagePicker'

const api = window.babel

/**
 * 대상 언어를 늘렸을 때 용어집에서 그 언어 칸이 빈 용어 수. 다시 추출하지 않고 [용어 번역]으로 채우라고 알린다.
 * 용어집을 읽지 못하면 알리지 않는다(저장은 이미 끝났다).
 */
async function glossaryGapNotice(added: readonly string[], t: Messages): Promise<string | null> {
  if (added.length === 0) return null
  const glossary = await api.glossary.list()
  if (!glossary.ok) return null
  const empty = findTranslateTargets(glossary.value.entries, added).length
  if (empty === 0) return null
  return t.projectScreen.glossaryGap(added.join(', '), empty)
}

type Props = {
  project: OpenProject
  /** 바뀐 묶음만 보낸다. 메인이 최신 project.json 에 합쳐 저장한 결과를 돌려준다. */
  onSave: (patch: ProjectSettingsPatch) => Promise<IpcResult<OpenProject>>
  /** 저장하지 않은 변경이 있는지. 다른 화면으로 갈 때 확인을 받는다. */
  onDirtyChange: (dirty: boolean) => void
  onMessage: (text: string) => void
}

function FieldError({ problems, field }: { problems: readonly SettingsProblem[]; field: SettingsField }): React.JSX.Element | null {
  const found = problems.filter((problem) => problem.field === field)
  if (found.length === 0) return null
  return (
    <>
      {found.map((problem) => (
        <p key={problem.message} className="hint field-error">
          {problem.message}
        </p>
      ))}
    </>
  )
}

/**
 * 프로젝트 설정(project.json). 여러 칸을 고친 뒤 한 번에 저장한다.
 * 저장할 때는 화면을 연 시점과 달라진 묶음만 보내므로, 그 사이 앱 밖에서 고친 다른 묶음은 지워지지 않는다.
 */
export function Project({ project, onSave, onDirtyChange, onMessage }: Props): React.JSX.Element {
  const t = useT()
  const { config } = project
  /** 화면을 연(또는 마지막으로 저장한) 시점의 설정. 바뀐 묶음을 가리는 기준이다. */
  const [base, setBase] = useState<ProjectConfig>(config)
  const [form, setForm] = useState<ProjectForm>(() => toProjectForm(config))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<IpcError | null>(null)
  const [externalChange, setExternalChange] = useState(false)

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(toProjectForm(base)), [form, base])
  const { config: draft, problems } = useMemo(() => fromProjectForm(form, base, t), [form, base, t])

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  // project.json 이 밖에서 바뀌었을 때: 편집 중이 아니면 새 값으로 다시 채우고, 편집 중이면 알리기만 한다
  useEffect(() => {
    if (dirtyRef.current) {
      setExternalChange(true)
      return
    }
    setBase(config)
    setForm(toProjectForm(config))
    setExternalChange(false)
  }, [config])

  const update = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const save = async (): Promise<void> => {
    if (problems.length > 0) return
    const patch = buildSettingsPatch(base, draft)
    if (Object.keys(patch).length === 0) return
    setSaving(true)
    try {
      const result = await onSave(patch)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setExternalChange(false)
      setBase(result.value.config)
      setForm(toProjectForm(result.value.config))
      const added = result.value.config.targetLanguages.filter((code) => !base.targetLanguages.includes(code))
      const gap = await glossaryGapNotice(added, t)
      onMessage(gap ? t.projectScreen.savedWithNotice(gap) : t.projectScreen.saved)
    } finally {
      setSaving(false)
    }
  }

  const discard = (): void => {
    setForm(toProjectForm(base))
    setError(null)
  }

  const targetCodes = form.targetLanguages
  const removedTargets = base.targetLanguages.filter((code) => !targetCodes.includes(code))
  // 내보내기 카드는 원문 + 대상 언어마다 한 줄
  const exportLanguages = [...new Set([form.sourceLanguage.trim(), ...targetCodes])].filter((code) => isLanguageTag(code))

  const updateLocale = (language: string, field: 'unityLocaleCode' | 'columnName', value: string): void => {
    const current = form.exportLocales[language] ?? { unityLocaleCode: '', columnName: '' }
    const next = { ...current, [field]: value }
    const locales = { ...form.exportLocales }
    // 두 칸이 다 비면 자동과 같으므로 항목을 지운다(저장할 때 바뀐 것으로 보지 않게)
    if (next.unityLocaleCode === '' && next.columnName === '') delete locales[language]
    else locales[language] = next
    update('exportLocales', locales)
  }

  return (
    <div className="project-screen">
      <div className="strings-header project-header">
        <h2 className="screen-title">{t.screens.project.label}</h2>
        <div className="row">
          <button type="button" disabled={saving || !dirty} onClick={discard}>
            {t.common.discardChanges}
          </button>
          <button
            type="button"
            className="primary"
            disabled={saving || !dirty || problems.length > 0}
            title={problems.length > 0 ? t.projectScreen.fixRedFirst : undefined}
            onClick={() => void save()}
          >
            {t.common.save}
            {dirty ? ' *' : ''}
          </button>
        </div>
      </div>

      {externalChange ? (
        <div className="message">{t.projectScreen.external}</div>
      ) : null}
      {error ? (
        <div className="message error">
          <strong>{error.message}</strong>
          {error.detail ? <pre>{error.detail}</pre> : null}
        </div>
      ) : null}

      <section className="card">
        <h3>{t.projectScreen.basics}</h3>
        <div className="field">
          <label htmlFor="project-name">{t.projectScreen.name}</label>
          <input id="project-name" value={form.name} onChange={(event) => update('name', event.target.value)} />
          <FieldError problems={problems} field="name" />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="source-language">{t.projectScreen.sourceLanguage}</label>
            <LanguageSelect
              id="source-language"
              value={form.sourceLanguage}
              exclude={targetCodes}
              onChange={(code) => update('sourceLanguage', code)}
            />
            <FieldError problems={problems} field="sourceLanguage" />
            {form.sourceLanguage.trim() !== base.sourceLanguage ? (
              <p className="hint">{t.projectScreen.sourceUnchanged}</p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="target-languages">{t.projectScreen.targetLanguages}</label>
            <LanguageMultiSelect
              id="target-languages"
              values={targetCodes}
              exclude={[form.sourceLanguage]}
              onChange={(codes) => update('targetLanguages', codes)}
            />
            <FieldError problems={problems} field="targetLanguages" />
            {removedTargets.length > 0 ? (
              <p className="hint">
                {t.projectScreen.filesKept(removedTargets.map((code) => `translations_${code}.csv`).join(', '))}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card">
        <h3>{t.projectScreen.game}</h3>
        <div className="field">
          <label htmlFor="game-genre">{t.projectScreen.genre}</label>
          <input
            id="game-genre"
            value={form.genre}
            onChange={(event) => update('genre', event.target.value)}
            placeholder={t.projectScreen.genrePlaceholder}
          />
        </div>
        <div className="field">
          <label htmlFor="game-intro">{t.projectScreen.intro}</label>
          <textarea
            id="game-intro"
            rows={5}
            value={form.intro}
            onChange={(event) => update('intro', event.target.value)}
            placeholder={t.projectScreen.introPlaceholder}
          />
        </div>
        <div className="field">
          <label htmlFor="game-tone">{t.projectScreen.tone}</label>
          <textarea
            id="game-tone"
            rows={4}
            value={form.toneGuide}
            onChange={(event) => update('toneGuide', event.target.value)}
            placeholder={t.projectScreen.tonePlaceholder}
          />
        </div>
      </section>

      <section className="card">
        <h3>{t.projectScreen.styleRules}</h3>
        {form.styleRules.length === 0 ? <p className="hint">{t.projectScreen.noRules}</p> : null}
        <ol className="style-rules">
          {form.styleRules.map((rule, index) => (
            <li key={rule.id} className="style-rule">
              <span className="style-rule-index mono">{index + 1}</span>
              <textarea
                rows={1}
                value={rule.text}
                placeholder={t.projectScreen.rulePlaceholder}
                onChange={(event) =>
                  update(
                    'styleRules',
                    form.styleRules.map((item, at) => (at === index ? { ...item, text: event.target.value } : item))
                  )
                }
              />
              <button
                type="button"
                className="ghost"
                title={t.projectScreen.deleteRuleHint}
                onClick={() =>
                  update(
                    'styleRules',
                    form.styleRules.filter((_item, at) => at !== index)
                  )
                }
              >
                {t.projectScreen.deleteRule}
              </button>
            </li>
          ))}
        </ol>
        <FieldError problems={problems} field="styleRules" />
        <button
          type="button"
          onClick={() =>
            update('styleRules', [
              ...form.styleRules,
              { id: nextStyleRuleId(form.styleRules), text: '', createdAt: new Date().toISOString() }
            ])
          }
        >
          {t.projectScreen.addRule}
        </button>
      </section>

      <section className="card">
        <h3>{t.projectScreen.translation}</h3>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">{t.translateOptions.modelLabel}</span>
            <select
              value={form.model}
              onChange={(event) => {
                const next = TranslateModel.safeParse(event.target.value)
                if (next.success) update('model', next.data)
              }}
            >
              {MODEL_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t.translateOptions.model[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="field" title={t.translateOptions.effortHint}>
            <span className="field-label">{t.translateOptions.effortLabel}</span>
            <select
              value={form.effort}
              onChange={(event) => {
                const next = TranslateEffort.safeParse(event.target.value)
                if (next.success) update('effort', next.data)
              }}
            >
              {EFFORT_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t.translateOptions.effort[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid three">
          <div className="field">
            <label htmlFor="batch-rows">{t.projectScreen.batchRows}</label>
            <input
              id="batch-rows"
              type="number"
              min={1}
              step={1}
              value={form.maxRows}
              onChange={(event) => update('maxRows', event.target.value)}
            />
            <FieldError problems={problems} field="batch.maxRows" />
          </div>
          <div className="field">
            <label htmlFor="batch-chars">{t.projectScreen.batchChars}</label>
            <input
              id="batch-chars"
              type="number"
              min={1}
              step={100}
              value={form.maxSourceChars}
              onChange={(event) => update('maxSourceChars', event.target.value)}
            />
            <FieldError problems={problems} field="batch.maxSourceChars" />
          </div>
          <div className="field">
            <label htmlFor="batch-workers">{t.projectScreen.workers(MAX_CONCURRENCY)}</label>
            <input
              id="batch-workers"
              type="number"
              min={1}
              max={MAX_CONCURRENCY}
              step={1}
              value={form.concurrency}
              onChange={(event) => update('concurrency', event.target.value)}
            />
            <FieldError problems={problems} field="batch.concurrency" />
          </div>
        </div>
      </section>

      <section className="card">
        <h3>{t.projectScreen.review}</h3>
        <div className="field">
          <label htmlFor="low-confidence">{t.projectScreen.lowConfidence}</label>
          <input
            id="low-confidence"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={form.lowConfidence}
            onChange={(event) => update('lowConfidence', event.target.value)}
            style={{ maxWidth: 160 }}
          />
          <FieldError problems={problems} field="review.lowConfidence" />
        </div>
      </section>

      <section className="card">
        <h3>{t.projectScreen.context}</h3>
        <div className="field">
          <label
            htmlFor="max-len-ratio"
            title={t.projectScreen.maxLenRatioHint(MIN_SUGGESTED_MAX_LEN)}
          >
            {t.projectScreen.maxLenRatio(MAX_LEN_RATIO_LIMIT)}
          </label>
          <input
            id="max-len-ratio"
            type="number"
            min={1}
            max={MAX_LEN_RATIO_LIMIT}
            step={0.1}
            value={form.maxLenRatio}
            onChange={(event) => update('maxLenRatio', event.target.value)}
            style={{ maxWidth: 160 }}
          />
          <FieldError problems={problems} field="context.maxLenRatio" />
        </div>
      </section>

      <section className="card" id="project-export-card">
        <h3>{t.projectScreen.export}</h3>
        <table className="locale-table">
          <thead>
            <tr>
              <th>{t.localeTable.language}</th>
              <th>{t.localeTable.localeCode}</th>
              <th>{t.localeTable.columnName}</th>
            </tr>
          </thead>
          <tbody>
            {exportLanguages.map((language) => {
              const locale = form.exportLocales[language] ?? { unityLocaleCode: '', columnName: '' }
              const code = locale.unityLocaleCode.trim() || language
              return (
                <tr key={language}>
                  <td>
                    <code>{language}</code>
                    {language === form.sourceLanguage.trim() ? <span className="hint"> {t.localeTable.source}</span> : null}
                  </td>
                  <td>
                    <input
                      className="mono"
                      value={locale.unityLocaleCode}
                      placeholder={language}
                      aria-label={t.localeTable.localeCodeOf(language)}
                      onChange={(event) => updateLocale(language, 'unityLocaleCode', event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="mono"
                      value={locale.columnName}
                      placeholder={defaultColumnName(code)}
                      aria-label={t.localeTable.columnNameOf(language)}
                      onChange={(event) => updateLocale(language, 'columnName', event.target.value)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <FieldError problems={problems} field="export.locales" />
      </section>

      <section className="card">
        <details>
          <summary>
            <h3 className="summary-title">{t.projectScreen.smart}</h3>
          </summary>
          <p className="hint" style={{ marginBottom: 'var(--space-3)' }}>
            {t.projectScreen.smartHint}
          </p>
          <div className="check-list">
            <label className="check">
              <input type="checkbox" checked={form.smartEnabled} onChange={(event) => update('smartEnabled', event.target.checked)} />
              <span>{t.projectScreen.smartEnabled}</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.alternativeEscaping}
                onChange={(event) => update('alternativeEscaping', event.target.checked)}
              />
              <span>{t.projectScreen.alternativeEscaping}</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.convertCharacterStringLiterals}
                onChange={(event) => update('convertCharacterStringLiterals', event.target.checked)}
              />
              <span>{t.projectScreen.characterLiterals}</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={form.caseSensitive} onChange={(event) => update('caseSensitive', event.target.checked)} />
              <span>{t.projectScreen.caseSensitive}</span>
            </label>
          </div>
          <div className="field">
            <label htmlFor="escape-char">{t.projectScreen.escapeChar}</label>
            <input
              id="escape-char"
              className="mono"
              value={form.escapeChar}
              onChange={(event) => update('escapeChar', event.target.value)}
              style={{ maxWidth: 80 }}
            />
            <FieldError problems={problems} field="smartStrings.escapeChar" />
          </div>
          <div className="field">
            <label htmlFor="formatters">{t.projectScreen.formatters}</label>
            <textarea
              id="formatters"
              className="mono"
              rows={3}
              value={form.formatters}
              onChange={(event) => update('formatters', event.target.value)}
            />
            <FieldError problems={problems} field="smartStrings.formatters" />
          </div>
        </details>
      </section>
    </div>
  )
}
