import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildBatches, clampConcurrency } from '@core/translate/batches'
import { selectRows } from '@core/translate/scope'
import { TranslateEffort, TranslateModel, type JobControlInput, type JobLogEntry, type JobView, type TranslateScope } from '@shared/schema/jobs'
import type { OpenProject, ProjectSettingsPatch } from '@shared/schema/project'
import type { MasterRow, StringsRow, StringsView, TranslationRow } from '@shared/schema/strings'
import type { IpcError } from '@shared/types'
import { JobLog } from '../JobLog'
import { JobProgress } from '../JobProgress'
import { KeyChecklist, type ChecklistItem } from '../KeyChecklist'
import { useI18n } from '../../i18n'
import { EFFORT_VALUES, MODEL_VALUES } from '../../state/translate-options'

const api = window.babel

/** 범위 선택지 순서. 이름과 설명은 카탈로그 `translate.scope` */
const SCOPES: readonly TranslateScope[] = ['untranslated', 'stale', 'all', 'selected']

function toMaster(row: StringsRow): MasterRow {
  return {
    key: row.key,
    source: row.source,
    context: row.context,
    ui_type: row.ui_type,
    max_len: row.max_len,
    vars: row.vars,
    smart: row.smart,
    tags: row.tags,
    source_hash: row.source_hash
  }
}

function toTranslation(row: StringsRow): TranslationRow {
  return {
    key: row.key,
    text: row.translation,
    source_hash: '',
    status: row.status,
    confidence: row.confidence,
    note: row.note,
    source_snapshot: row.source_snapshot
  }
}

type Props = {
  project: OpenProject
  job: JobView | null
  jobLog: readonly JobLogEntry[]
  onMessage: (text: string) => void
  /** 모델·사고 수준을 고르면 바로 project.json 에 저장한다. 프로젝트 화면과 같은 값이다. */
  onSettings: (patch: ProjectSettingsPatch) => void
}

export function Translate({ project, job, jobLog, onMessage, onSettings }: Props): React.JSX.Element {
  const { t, locale } = useI18n()
  const { config } = project
  const { model, effort } = config.translate
  const [language, setLanguage] = useState(config.targetLanguages[0] ?? '')
  const [scope, setScope] = useState<TranslateScope>('untranslated')
  const [view, setView] = useState<StringsView | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<IpcError | null>(null)

  const running = job !== null && job.snapshot.state !== 'done' && job.snapshot.state !== 'cancelled'

  const load = useCallback(async (target: string) => {
    if (!target) return
    const result = await api.strings.list(target)
    if (result.ok) {
      setView(result.value)
      setError(null)
    } else {
      setError(result.error)
    }
  }, [])

  useEffect(() => {
    setSelected(new Set())
    void load(language)
  }, [language, load])

  // 배치가 기록될 때마다 범위별 행 수를 새로 읽는다
  const doneRows = job?.snapshot.doneRows ?? 0
  const jobLanguage = job?.language ?? null
  useEffect(() => {
    if (jobLanguage === language) void load(language)
  }, [doneRows, jobLanguage, language, load])

  const rows = useMemo(() => view?.rows ?? [], [view])
  const master = useMemo(() => rows.map(toMaster), [rows])
  const translations = useMemo(() => rows.map(toTranslation), [rows])

  const counts = useMemo(
    () => ({
      untranslated: selectRows(master, translations, 'untranslated').rows.length,
      stale: selectRows(master, translations, 'stale').rows.length,
      all: selectRows(master, translations, 'all').rows.length,
      selected: selectRows(master, translations, 'selected', selected).rows.length
    }),
    [master, translations, selected]
  )

  const plan = useMemo(() => {
    const scoped = selectRows(master, translations, scope, selected)
    return {
      rows: scoped.rows.length,
      skipped: scoped.skippedApproved.length,
      batches: buildBatches(scoped.rows, config.batch).length
    }
  }, [config.batch, master, translations, scope, selected])

  const checklist: ChecklistItem[] = useMemo(
    () => rows.map((row) => ({ key: row.key, source: row.source, status: row.status })),
    [rows]
  )

  const selectWhere = (predicate: (row: StringsRow) => boolean): void => {
    setSelected(new Set(rows.filter((row) => row.status !== 'approved' && predicate(row)).map((row) => row.key)))
  }

  const start = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.jobs.start({ language, scope, keys: scope === 'selected' ? [...selected] : [], model, effort })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      onMessage(t.translate.started(language, result.value.snapshot.totalRows))
    } finally {
      setBusy(false)
    }
  }

  const control = async (action: JobControlInput['action']): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.jobs.control(action)
      if (!result.ok) setError(result.error)
    } finally {
      setBusy(false)
    }
  }

  if (config.targetLanguages.length === 0) {
    return (
      <div>
        <h2 className="screen-title">{t.screens.translate.label}</h2>
        <div className="card">
          <h3>{t.common.noTargetLanguages}</h3>
          <p className="hint">{t.common.setTargetLanguages}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="translate-screen">
      <h2 className="screen-title">{t.screens.translate.label}</h2>

      <div className="card">
        <div className="translate-form">
          <label className="field">
            <span className="field-label">{t.translate.targetLanguage}</span>
            <select value={language} disabled={running || busy} onChange={(event) => setLanguage(event.target.value)}>
              {config.targetLanguages.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t.translateOptions.modelLabel}</span>
            <select
              value={model}
              disabled={running || busy}
              onChange={(event) => {
                const next = TranslateModel.safeParse(event.target.value)
                if (next.success) onSettings({ translate: { model: next.data } })
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
              value={effort}
              disabled={running || busy}
              onChange={(event) => {
                const next = TranslateEffort.safeParse(event.target.value)
                if (next.success) onSettings({ translate: { effort: next.data } })
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

        <div className="scope-options">
          {SCOPES.map((value) => (
            <label key={value} className={scope === value ? 'scope-option selected' : 'scope-option'} title={t.translate.scope[value].hint}>
              <input
                type="radio"
                name="scope"
                checked={scope === value}
                disabled={running || busy}
                onChange={() => setScope(value)}
              />
              <span>{t.translate.scope[value].label}</span>
              <span className="scope-count">{counts[value]}</span>
            </label>
          ))}
        </div>

        <p className="hint">
          {t.translateOptions.batch(config.batch.maxRows, config.batch.maxSourceChars.toLocaleString(locale))} ·{' '}
          {t.translateOptions.workers(clampConcurrency(config.batch.concurrency))}
        </p>

        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          <button
            type="button"
            className="primary"
            disabled={running || busy || plan.rows === 0}
            onClick={() => void start()}
          >
            {t.translate.start}
          </button>
          <span className="hint">
            {t.job.rowsAndBatches(plan.rows, plan.batches)}
            {plan.skipped > 0 ? t.translate.skippedApproved(plan.skipped) : ''}
            {running && job.kind !== 'translate' ? t.job.busyWith(t.job.title[job.kind]) : ''}
          </span>
        </div>

        {error ? (
          <div className="message error">
            <strong>{error.message}</strong>
            {error.detail ? <pre>{error.detail}</pre> : null}
          </div>
        ) : null}
      </div>

      {scope === 'selected' ? (
        <div className="card">
          <div className="row checklist-toolbar">
            <strong>{t.translate.rowsToTranslate}</strong>
            <span className="hint">{t.common.selected(selected.size)}</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              disabled={running}
              onClick={() => selectWhere((row) => row.status === 'untranslated' || row.translation.trim() === '')}
            >
              {t.translate.onlyUntranslated}
            </button>
            <button type="button" disabled={running} onClick={() => selectWhere((row) => row.status === 'stale')}>
              {t.translate.onlyStale}
            </button>
            <button type="button" disabled={running} onClick={() => selectWhere(() => true)}>
              {t.common.selectAll}
            </button>
            <button type="button" disabled={running} onClick={() => setSelected(new Set())}>
              {t.common.clearSelection}
            </button>
          </div>
          <KeyChecklist items={checklist} selected={selected} disabled={running} onChange={setSelected} />
        </div>
      ) : null}

      {job ? <JobProgress job={job} busy={busy} onControl={(action) => void control(action)} /> : null}

      {jobLog.length > 0 ? (
        <div className="card">
          <h3>{t.job.log}</h3>
          <JobLog entries={jobLog} />
        </div>
      ) : null}
    </div>
  )
}
