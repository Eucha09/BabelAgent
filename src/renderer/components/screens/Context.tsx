import { useCallback, useEffect, useMemo, useState } from 'react'
import { MIN_SUGGESTED_MAX_LEN } from '@core/context/submission'
import { fieldValueProblem } from '@core/context/suggestions'
import { selectContextTargets } from '@core/context/targets'
import { parseConfidence } from '@core/review/filter'
import { buildBatches, clampConcurrency } from '@core/translate/batches'
import {
  CONTEXT_FIELDS,
  type ApplyContextItem,
  type ApplyContextResult,
  type ContextField,
  type ContextFieldValues,
  type ContextScope,
  type ContextView
} from '@shared/schema/context'
import type { JobControlInput, JobLogEntry, JobView } from '@shared/schema/jobs'
import type { OpenProject } from '@shared/schema/project'
import type { MasterRow, StringsRow } from '@shared/schema/strings'
import type { IpcError } from '@shared/types'
import type { Messages } from '@shared/i18n'
import { useI18n } from '../../i18n'
import { ConfirmDialog } from '../ConfirmDialog'
import { ContextGrid, type ContextGridRow } from '../ContextGrid'
import { JobLog } from '../JobLog'
import { JobProgress } from '../JobProgress'
import { KeyChecklist, type ChecklistItem } from '../KeyChecklist'

const api = window.babel

const SUGGESTIONS_FILE = 'context_suggestions.csv'

function fieldHint(field: ContextField, maxLenRatio: number, t: Messages): string {
  return field === 'max_len' ? t.contextScreen.fieldHint.max_len(maxLenRatio, MIN_SUGGESTED_MAX_LEN) : t.contextScreen.fieldHint[field]
}

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

function describeApply({ applied, skipped }: ApplyContextResult, t: Messages): string {
  const parts = [t.contextScreen.applied(applied.length)]
  if (skipped.length > 0) {
    const counts = new Map<string, number>()
    for (const item of skipped) {
      const label = t.contextScreen.skip[item.reason]
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    parts.push(t.contextScreen.skipped(skipped.length, [...counts].map(([label, count]) => `${label} ${count}`).join(' · ')))
  }
  return parts.join(' ')
}

type Drafts = Record<string, Partial<ContextFieldValues>>

type Props = {
  project: OpenProject
  job: JobView | null
  jobLog: readonly JobLogEntry[]
  onMessage: (text: string) => void
  /** 고친 제안이 있는지. 다른 화면으로 갈 때 확인을 받는다. */
  onDirtyChange: (dirty: boolean) => void
}

/**
 * 컨텍스트 보강. 에이전트가 원문의 빈 메타데이터 칸(context·ui_type·max_len·vars)을 제안하면
 * context_suggestions.csv 에 쌓이고, 사람이 여기서 고치고 승인해야 strings_master.csv 에 들어간다.
 */
export function Context({ project, job, jobLog, onMessage, onDirtyChange }: Props): React.JSX.Element {
  const { t, locale } = useI18n()
  const { config } = project
  const syntax = config.smartStrings
  const lowConfidence = config.review.lowConfidence
  const [master, setMaster] = useState<MasterRow[]>([])
  const [view, setView] = useState<ContextView | null>(null)
  const [drafts, setDrafts] = useState<Drafts>({})
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [fields, setFields] = useState<ReadonlySet<ContextField>>(new Set(CONTEXT_FIELDS))
  const [scope, setScope] = useState<ContextScope>('empty')
  const [scopeKeys, setScopeKeys] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<IpcError | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const running = job !== null && job.snapshot.state !== 'done' && job.snapshot.state !== 'cancelled'

  const load = useCallback(async () => {
    const [strings, suggestions] = await Promise.all([api.strings.list(null), api.context.list()])
    if (!strings.ok) {
      setError(strings.error)
      return
    }
    if (!suggestions.ok) {
      setError(suggestions.error)
      return
    }
    setError(null)
    setMaster(strings.value.rows.map(toMaster))
    setView(suggestions.value)
    // 사라진 제안의 선택·편집은 버린다
    const keys = new Set(suggestions.value.suggestions.map((item) => item.key))
    setSelected((prev) => new Set([...prev].filter((key) => keys.has(key))))
    setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => keys.has(key))))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 추정 배치가 제안을 기록하면, 원문이나 제안 파일이 밖에서 바뀌면 다시 읽는다. 고친 값은 키별로 남는다.
  useEffect(() => {
    const offWritten = api.project.onDataWritten(({ file }) => {
      if (file === SUGGESTIONS_FILE) void load()
    })
    const offChanged = api.strings.onFileChanged(({ file }) => {
      if (file === SUGGESTIONS_FILE || file === 'strings_master.csv') void load()
    })
    return () => {
      offWritten()
      offChanged()
    }
  }, [load])

  const suggestions = useMemo(() => view?.suggestions ?? [], [view])

  const rows: ContextGridRow[] = useMemo(
    () =>
      suggestions.map((suggestion) => {
        const draft = drafts[suggestion.key] ?? {}
        const values: ContextFieldValues = {
          context: draft.context ?? suggestion.context,
          ui_type: draft.ui_type ?? suggestion.ui_type,
          max_len: draft.max_len ?? suggestion.max_len,
          vars: draft.vars ?? suggestion.vars
        }
        const problems: Partial<Record<ContextField, string>> = {}
        for (const field of CONTEXT_FIELDS) {
          if (suggestion[field] === '') continue
          const problem = fieldValueProblem(field, values[field], t)
          if (problem) problems[field] = problem
        }
        const confidence = parseConfidence(suggestion.confidence)
        return {
          ...suggestion,
          values,
          problems,
          selected: selected.has(suggestion.key),
          low: confidence !== null && confidence < lowConfidence,
          edited: CONTEXT_FIELDS.some((field) => values[field] !== suggestion[field])
        }
      }),
    [suggestions, drafts, selected, lowConfidence, t]
  )

  const dirty = rows.some((row) => row.edited)
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const pendingKeys = useMemo(() => new Set(suggestions.map((item) => item.key)), [suggestions])
  const fieldList = useMemo(() => CONTEXT_FIELDS.filter((field) => fields.has(field)), [fields])
  const plan = useMemo(() => {
    const result = selectContextTargets(master, { fields: fieldList, scope, selected: scopeKeys }, pendingKeys, syntax)
    return {
      rows: result.targets.length,
      skipped: result.skippedPending.length,
      batches: buildBatches(
        result.targets.map((target) => target.row),
        config.batch
      ).length
    }
  }, [config.batch, fieldList, master, pendingKeys, scope, scopeKeys, syntax])
  const emptyCount = useMemo(
    () => selectContextTargets(master, { fields: fieldList, scope: 'empty', selected: new Set() }, pendingKeys, syntax).targets.length,
    [fieldList, master, pendingKeys, syntax]
  )
  const checklist: ChecklistItem[] = useMemo(() => master.map((row) => ({ key: row.key, source: row.source })), [master])

  const selectable = (row: ContextGridRow): boolean => !row.missing && Object.keys(row.problems).length === 0
  const confident = rows.filter((row) => selectable(row) && !row.low && !row.stale)
  const lowCount = rows.filter((row) => row.low).length
  const chosen = rows.filter((row) => row.selected)

  const onToggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const onEdit = useCallback((key: string, field: ContextField, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }, [])

  const toggleField = (field: ContextField): void => {
    setFields((prev) => {
      const next = new Set(prev)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      return next
    })
  }

  const start = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.context.estimate({ fields: fieldList, scope, keys: scope === 'selected' ? [...scopeKeys] : [] })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      onMessage(t.contextScreen.started(result.value.snapshot.totalRows))
    } finally {
      setBusy(false)
    }
  }

  const control = async (action: JobControlInput['action']): Promise<void> => {
    const result = await api.jobs.control(action)
    if (!result.ok) setError(result.error)
  }

  const apply = async (): Promise<void> => {
    // 제안한 필드만 보낸다. expected 는 화면이 본 원문 칸 — 그 사이 바뀌었으면 메인이 건너뛴다
    const items: ApplyContextItem[] = chosen.map((row) => {
      const values: ApplyContextItem['values'] = {}
      const expected: ApplyContextItem['values'] = {}
      for (const field of CONTEXT_FIELDS) {
        if (row[field] === '') continue
        values[field] = row.values[field]
        expected[field] = row.current[field]
      }
      return { key: row.key, values, expected }
    })
    if (items.length === 0) return
    setBusy(true)
    try {
      const result = await api.context.apply({ items })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      onMessage(describeApply(result.value, t))
      const applied = new Set(result.value.applied)
      setSelected((prev) => new Set([...prev].filter((key) => !applied.has(key))))
      setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !applied.has(key))))
      await load()
    } finally {
      setBusy(false)
    }
  }

  const discard = async (): Promise<void> => {
    setConfirmDiscard(false)
    const keys = chosen.map((row) => row.key)
    if (keys.length === 0) return
    setBusy(true)
    try {
      const result = await api.context.discard(keys)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      onMessage(t.contextScreen.discarded(result.value))
      setSelected(new Set())
      await load()
    } finally {
      setBusy(false)
    }
  }

  const ownJob = job !== null && job.kind === 'context'
  const ownLog = ownJob ? jobLog.filter((entry) => entry.at >= job.startedAt) : []

  return (
    <div className="workbench-screen">
      <h2 className="screen-title">{t.screens.context.label}</h2>

      <section className="card">
        <h3>{t.contextScreen.infer}</h3>
        <div className="check-row">
          {CONTEXT_FIELDS.map((field) => (
            <label key={field} className="check" title={fieldHint(field, config.context.maxLenRatio, t)}>
              <input type="checkbox" checked={fields.has(field)} disabled={running || busy} onChange={() => toggleField(field)} />
              <span>{t.contextScreen.field[field]}</span>
            </label>
          ))}
        </div>
        <div className="scope-options">
          <label className={scope === 'empty' ? 'scope-option selected' : 'scope-option'} title={t.contextScreen.scopeEmptyHint}>
            <input type="radio" name="context-scope" checked={scope === 'empty'} disabled={running || busy} onChange={() => setScope('empty')} />
            <span>{t.contextScreen.scopeEmpty}</span>
            <span className="scope-count">{emptyCount}</span>
          </label>
          <label className={scope === 'selected' ? 'scope-option selected' : 'scope-option'} title={t.contextScreen.scopeSelectedHint}>
            <input type="radio" name="context-scope" checked={scope === 'selected'} disabled={running || busy} onChange={() => setScope('selected')} />
            <span>{t.contextScreen.scopeSelected}</span>
            <span className="scope-count">{scopeKeys.size}</span>
          </label>
        </div>
        <p className="hint">
          {[
            t.translateOptions.summary(t.translateOptions.model[config.translate.model], t.translateOptions.effort[config.translate.effort]),
            t.translateOptions.batch(config.batch.maxRows, config.batch.maxSourceChars.toLocaleString(locale)),
            t.translateOptions.workers(clampConcurrency(config.batch.concurrency))
          ].join(' · ')}
        </p>
        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          <button type="button" className="primary" disabled={running || busy || plan.rows === 0} onClick={() => void start()}>
            {t.contextScreen.start}
          </button>
          <span className="hint">
            {t.job.rowsAndBatches(plan.rows, plan.batches)}
            {plan.skipped > 0 ? t.contextScreen.skippedPending(plan.skipped) : ''}
            {running && job.kind !== 'context' ? t.job.busyWith(t.job.title[job.kind]) : ''}
          </span>
        </div>
      </section>

      {scope === 'selected' ? (
        <section className="card">
          <div className="row checklist-toolbar">
            <strong>{t.contextScreen.rowsToInfer}</strong>
            <span className="hint">{t.common.selected(scopeKeys.size)}</span>
            <span className="spacer" />
            <button type="button" disabled={running} onClick={() => setScopeKeys(new Set(master.map((row) => row.key)))}>
              {t.common.selectAll}
            </button>
            <button type="button" disabled={running} onClick={() => setScopeKeys(new Set())}>
              {t.common.clearSelection}
            </button>
          </div>
          <KeyChecklist items={checklist} selected={scopeKeys} disabled={running} onChange={setScopeKeys} />
        </section>
      ) : null}

      {ownJob ? <JobProgress job={job} busy={busy} onControl={(action) => void control(action)} /> : null}
      {ownLog.length > 0 ? (
        <details className="card job-log-card">
          <summary>{t.job.logCount(ownLog.length)}</summary>
          <JobLog entries={ownLog} />
        </details>
      ) : null}

      {error ? (
        <div className="message error">
          <strong>{error.message}</strong>
          {error.detail ? <pre>{error.detail}</pre> : null}
        </div>
      ) : null}
      {view?.notices.map((notice) => (
        <div className="message" key={notice.file}>
          {t.common.readEncoding(notice.file, notice.encoding.toUpperCase())}
        </div>
      ))}

      <div className="grid-toolbar">
        <div className="grid-meta">
          {t.contextScreen.meta(rows.length, lowCount, chosen.length)}
          {dirty ? t.contextScreen.edited : ''}
        </div>
        <div className="row">
          <button
            type="button"
            disabled={busy || confident.length === 0}
            title={t.contextScreen.selectConfidentHint(lowConfidence)}
            onClick={() => setSelected(new Set(confident.map((row) => row.key)))}
          >
            {t.contextScreen.selectConfident(confident.length)}
          </button>
          <button type="button" disabled={busy || rows.length === 0} onClick={() => setSelected(new Set(rows.filter(selectable).map((row) => row.key)))}>
            {t.contextScreen.selectAll}
          </button>
          <button type="button" disabled={busy || chosen.length === 0} onClick={() => setSelected(new Set())}>
            {t.common.clearSelection}
          </button>
          <button type="button" className="danger" disabled={busy || chosen.length === 0} onClick={() => setConfirmDiscard(true)}>
            {t.contextScreen.discardSelected}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || chosen.length === 0 || chosen.some((row) => !selectable(row))}
            title={chosen.some((row) => !selectable(row)) ? t.contextScreen.fixFirst : undefined}
            onClick={() => void apply()}
          >
            {t.contextScreen.applySelected(chosen.length)}
          </button>
        </div>
      </div>

      {view ? <ContextGrid rows={rows} syntax={syntax} onToggle={onToggle} onEdit={onEdit} /> : null}

      {confirmDiscard ? (
        <ConfirmDialog
          title={t.contextScreen.discardTitle}
          confirmLabel={t.contextScreen.discardConfirm(chosen.length)}
          danger
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => void discard()}
        >
          <p>{t.contextScreen.discardBody(chosen.length)}</p>
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
