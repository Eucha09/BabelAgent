import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildBatches, clampConcurrency } from '@core/translate/batches'
import { selectRows } from '@core/translate/scope'
import type { JobControlInput, JobLogEntry, JobView, TranslateModel, TranslateScope } from '@shared/schema/jobs'
import type { OpenProject } from '@shared/schema/project'
import type { MasterRow, StringsRow, StringsView, TranslationRow } from '@shared/schema/strings'
import type { IpcError } from '@shared/types'
import { JobLog } from '../JobLog'
import { JobProgress } from '../JobProgress'
import { KeyChecklist, type ChecklistItem } from '../KeyChecklist'

const api = window.babel

const SCOPES: { value: TranslateScope; label: string; hint: string }[] = [
  { value: 'untranslated', label: '미번역', hint: '번역이 없거나 비어 있는 행' },
  { value: 'stale', label: 'stale', hint: '원문이 바뀐 행' },
  { value: 'all', label: '전체', hint: '승인되지 않은 모든 행. 초안·검토 번역도 다시 씁니다' },
  { value: 'selected', label: '선택 행', hint: '아래 목록에서 고른 행' }
]

const MODELS: { value: TranslateModel; label: string }[] = [
  { value: 'default', label: '기본 (CLI 설정)' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' }
]

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

function toTranslation(row: StringsRow): TranslationRow {
  return { key: row.key, text: row.translation, source_hash: '', status: row.status, confidence: row.confidence, note: row.note }
}

type Props = {
  project: OpenProject
  job: JobView | null
  jobLog: readonly JobLogEntry[]
  onMessage: (text: string) => void
}

export function Translate({ project, job, jobLog, onMessage }: Props): React.JSX.Element {
  const { config } = project
  const [language, setLanguage] = useState(config.targetLanguages[0] ?? '')
  const [scope, setScope] = useState<TranslateScope>('untranslated')
  const [model, setModel] = useState<TranslateModel>(config.translate.model)
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
      const result = await api.jobs.start({ language, scope, keys: scope === 'selected' ? [...selected] : [], model })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      onMessage(`번역을 시작했습니다: ${language} · ${result.value.snapshot.totalRows}행`)
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
        <h2 className="screen-title">번역</h2>
        <div className="card">
          <h3>대상 언어가 없습니다</h3>
          <p className="hint">project.json 의 targetLanguages 에 번역할 언어를 넣어 주세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="translate-screen">
      <h2 className="screen-title">번역</h2>
      <p className="screen-desc">
        배치마다 새 에이전트 세션을 열어 번역하고, 검증을 통과한 배치만 번역 파일에 한 번에 기록합니다.
        승인된 행은 어느 범위에서도 건드리지 않습니다.
      </p>

      <div className="card">
        <div className="translate-form">
          <label className="field">
            <span className="field-label">대상 언어</span>
            <select value={language} disabled={running || busy} onChange={(event) => setLanguage(event.target.value)}>
              {config.targetLanguages.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">모델</span>
            <select
              value={model}
              disabled={running || busy}
              onChange={(event) => {
                const next = MODELS.find((item) => item.value === event.target.value)
                if (next) setModel(next.value)
              }}
            >
              {MODELS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="scope-options">
          {SCOPES.map((item) => (
            <label key={item.value} className={scope === item.value ? 'scope-option selected' : 'scope-option'} title={item.hint}>
              <input
                type="radio"
                name="scope"
                checked={scope === item.value}
                disabled={running || busy}
                onChange={() => setScope(item.value)}
              />
              <span>{item.label}</span>
              <span className="scope-count">{counts[item.value]}</span>
            </label>
          ))}
        </div>

        <p className="hint">
          배치 {config.batch.maxRows}행 / {config.batch.maxSourceChars.toLocaleString()}자 · 작업자{' '}
          {clampConcurrency(config.batch.concurrency)} — project.json 의 batch 에서 바꿀 수 있습니다.
        </p>

        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          <button
            type="button"
            className="primary"
            disabled={running || busy || plan.rows === 0}
            onClick={() => void start()}
          >
            번역 시작
          </button>
          <span className="hint">
            {plan.rows}행 · 배치 {plan.batches}개{plan.skipped > 0 ? ` · 승인 ${plan.skipped}행 제외` : ''}
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
            <strong>번역할 행</strong>
            <span className="hint">선택 {selected.size}</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              disabled={running}
              onClick={() => selectWhere((row) => row.status === 'untranslated' || row.translation.trim() === '')}
            >
              미번역만
            </button>
            <button type="button" disabled={running} onClick={() => selectWhere((row) => row.status === 'stale')}>
              stale만
            </button>
            <button type="button" disabled={running} onClick={() => selectWhere(() => true)}>
              모두
            </button>
            <button type="button" disabled={running} onClick={() => setSelected(new Set())}>
              선택 해제
            </button>
          </div>
          <KeyChecklist items={checklist} selected={selected} disabled={running} onChange={setSelected} />
        </div>
      ) : null}

      {job ? <JobProgress job={job} busy={busy} onControl={(action) => void control(action)} /> : null}

      {jobLog.length > 0 ? (
        <div className="card">
          <h3>작업 로그</h3>
          <JobLog entries={jobLog} />
        </div>
      ) : null}
    </div>
  )
}
