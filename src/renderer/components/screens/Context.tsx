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
import { effortLabel, modelLabel } from '../../state/translate-options'
import { ConfirmDialog } from '../ConfirmDialog'
import { ContextGrid, type ContextGridRow } from '../ContextGrid'
import { JobLog } from '../JobLog'
import { JOB_TITLE, JobProgress } from '../JobProgress'
import { KeyChecklist, type ChecklistItem } from '../KeyChecklist'

const api = window.babel

const SUGGESTIONS_FILE = 'context_suggestions.csv'

export const FIELD_LABEL: Record<ContextField, string> = {
  context: '컨텍스트',
  ui_type: 'UI 유형',
  max_len: '최대 길이',
  vars: '변수 설명'
}

function fieldHint(field: ContextField, maxLenRatio: number): string {
  switch (field) {
    case 'context':
      return '문장이 나오는 상황·화자·가리키는 대상'
    case 'ui_type':
      return 'dialogue, button, tooltip 같은 분류. 이미 쓰는 값을 따릅니다'
    case 'max_len':
      return `버튼·탭처럼 길이 제한이 분명한 짧은 UI 문구에만 제안합니다. 번역문의 한도라서 원문 길이 × ${maxLenRatio}(최소 ${MIN_SUGGESTED_MAX_LEN}자) 아래로는 제안하지 않습니다 — 배수는 프로젝트 화면에서 바꿉니다`
    case 'vars':
      return '원문의 변수마다 종류·의미·예시. 변수가 없는 행은 묻지 않습니다'
  }
}

const SKIP_LABEL: Record<ApplyContextResult['skipped'][number]['reason'], string> = {
  missing: '원문에 없음',
  changed: '그 사이 원문 칸이 바뀜',
  invalid: '값 형식 오류',
  empty: '적용할 값 없음'
}

function toMaster(row: StringsRow): MasterRow {
  return {
    key: row.key,
    source: row.source,
    context: row.context,
    ui_type: row.ui_type,
    max_len: row.max_len,
    vars: row.vars,
    tags: row.tags,
    source_hash: row.source_hash
  }
}

function describeApply({ applied, skipped }: ApplyContextResult): string {
  const parts = [`${applied.length}행을 원문에 적용했습니다.`]
  if (skipped.length > 0) {
    const counts = new Map<string, number>()
    for (const item of skipped) counts.set(SKIP_LABEL[item.reason], (counts.get(SKIP_LABEL[item.reason]) ?? 0) + 1)
    parts.push(`${skipped.length}행은 건너뛰었습니다(${[...counts].map(([label, count]) => `${label} ${count}`).join(' · ')}).`)
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
          const problem = fieldValueProblem(field, values[field])
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
    [suggestions, drafts, selected, lowConfidence]
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
      onMessage(`컨텍스트 추정을 시작했습니다: ${result.value.snapshot.totalRows}행`)
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
      onMessage(describeApply(result.value))
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
      onMessage(`제안 ${result.value}행을 버렸습니다.`)
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
      <div className="strings-header">
        <div>
          <h2 className="screen-title">컨텍스트</h2>
          <p className="screen-desc">
            에이전트가 원문의 빈 메타데이터 칸을 제안합니다. 제안은 context_suggestions.csv 에 쌓이고, 여기서 고치고
            승인한 행만 strings_master.csv 에 들어갑니다. 이미 채워진 칸은 건드리지 않고, 메타데이터는 번역 상태를 바꾸지
            않습니다.
          </p>
        </div>
      </div>

      <section className="card">
        <h3>컨텍스트 추정</h3>
        <div className="check-row">
          {CONTEXT_FIELDS.map((field) => (
            <label key={field} className="check" title={fieldHint(field, config.context.maxLenRatio)}>
              <input type="checkbox" checked={fields.has(field)} disabled={running || busy} onChange={() => toggleField(field)} />
              <span>{FIELD_LABEL[field]}</span>
            </label>
          ))}
        </div>
        <div className="scope-options">
          <label className={scope === 'empty' ? 'scope-option selected' : 'scope-option'} title="고른 필드 중 빈 칸이 있는 모든 행">
            <input type="radio" name="context-scope" checked={scope === 'empty'} disabled={running || busy} onChange={() => setScope('empty')} />
            <span>빈 칸 있는 행</span>
            <span className="scope-count">{emptyCount}</span>
          </label>
          <label className={scope === 'selected' ? 'scope-option selected' : 'scope-option'} title="아래 목록에서 고른 행">
            <input type="radio" name="context-scope" checked={scope === 'selected'} disabled={running || busy} onChange={() => setScope('selected')} />
            <span>선택 행</span>
            <span className="scope-count">{scopeKeys.size}</span>
          </label>
        </div>
        <p className="hint">
          배치 {config.batch.maxRows}행 / {config.batch.maxSourceChars.toLocaleString()}자 · 작업자 {clampConcurrency(config.batch.concurrency)} ·
          모델 {modelLabel(config.translate.model)} · 사고 {effortLabel(config.translate.effort)} — 프로젝트 화면의 번역 설정을 따릅니다.
          {fields.has('max_len')
            ? ` 최대 길이는 원문 길이 × ${config.context.maxLenRatio}(최소 ${MIN_SUGGESTED_MAX_LEN}자) 이상으로 넉넉하게 제안합니다.`
            : ''}
        </p>
        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          <button type="button" className="primary" disabled={running || busy || plan.rows === 0} onClick={() => void start()}>
            추정 시작
          </button>
          <span className="hint">
            {plan.rows}행 · 배치 {plan.batches}개{plan.skipped > 0 ? ` · 제안 대기 ${plan.skipped}행 제외` : ''}
            {running && job.kind !== 'context' ? ` — ${JOB_TITLE[job.kind]}이 끝나면 시작할 수 있습니다` : ''}
          </span>
        </div>
      </section>

      {scope === 'selected' ? (
        <section className="card">
          <div className="row checklist-toolbar">
            <strong>추정할 행</strong>
            <span className="hint">선택 {scopeKeys.size} · 고른 필드가 모두 채워진 행은 건너뜁니다</span>
            <span className="spacer" />
            <button type="button" disabled={running} onClick={() => setScopeKeys(new Set(master.map((row) => row.key)))}>
              모두
            </button>
            <button type="button" disabled={running} onClick={() => setScopeKeys(new Set())}>
              선택 해제
            </button>
          </div>
          <KeyChecklist items={checklist} selected={scopeKeys} disabled={running} onChange={setScopeKeys} />
        </section>
      ) : null}

      {ownJob ? <JobProgress job={job} busy={busy} onControl={(action) => void control(action)} /> : null}
      {ownLog.length > 0 ? (
        <details className="card job-log-card">
          <summary>작업 로그 ({ownLog.length})</summary>
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
          {notice.file} 은 {notice.encoding.toUpperCase()}로 읽었습니다. 저장은 UTF-8로 합니다.
        </div>
      ))}

      <div className="grid-toolbar">
        <div className="grid-meta">
          제안 {rows.length}행 · 신뢰도 낮음 {lowCount} · 선택 {chosen.length}
          {dirty ? ' · 고친 제안 있음' : ''}
        </div>
        <div className="row">
          <button
            type="button"
            disabled={busy || confident.length === 0}
            title={`신뢰도 ${lowConfidence} 이상이고, 원문이 바뀌지 않았고, 값 형식이 맞는 제안을 고릅니다`}
            onClick={() => setSelected(new Set(confident.map((row) => row.key)))}
          >
            기준 이상 선택 ({confident.length})
          </button>
          <button type="button" disabled={busy || rows.length === 0} onClick={() => setSelected(new Set(rows.filter(selectable).map((row) => row.key)))}>
            모두 선택
          </button>
          <button type="button" disabled={busy || chosen.length === 0} onClick={() => setSelected(new Set())}>
            선택 해제
          </button>
          <button type="button" className="danger" disabled={busy || chosen.length === 0} onClick={() => setConfirmDiscard(true)}>
            선택 버리기
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || chosen.length === 0 || chosen.some((row) => !selectable(row))}
            title={chosen.some((row) => !selectable(row)) ? '형식이 틀린 값이나 원문에 없는 행을 먼저 고치거나 선택에서 빼세요' : undefined}
            onClick={() => void apply()}
          >
            선택 적용 ({chosen.length})
          </button>
        </div>
      </div>

      {view ? <ContextGrid rows={rows} syntax={syntax} onToggle={onToggle} onEdit={onEdit} /> : null}

      {confirmDiscard ? (
        <ConfirmDialog
          title="제안 버리기"
          confirmLabel={`${chosen.length}행 버리기`}
          danger
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => void discard()}
        >
          <p>선택한 제안 {chosen.length}행을 context_suggestions.csv 에서 지웁니다. 원문은 바뀌지 않습니다.</p>
          <p className="hint">다시 추정하면 그 행을 다시 제안받을 수 있습니다(사용량을 다시 씁니다).</p>
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
