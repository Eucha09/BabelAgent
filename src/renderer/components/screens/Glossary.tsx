import { useCallback, useEffect, useMemo, useState } from 'react'
import { termKey } from '@core/glossary/entries'
import { parseConfidence } from '@core/review/filter'
import { buildBatches, clampConcurrency } from '@core/translate/batches'
import type {
  AddTermResult,
  RetranslateTermResult,
  GlossaryChange,
  GlossaryEntry,
  GlossarySkipReason,
  GlossaryView,
  StartTermTranslateInput,
  TermsScope
} from '@shared/schema/glossary'
import type { JobControlInput, JobLogEntry, JobView } from '@shared/schema/jobs'
import type { OpenProject } from '@shared/schema/project'
import type { MasterRow, StringsRow } from '@shared/schema/strings'
import type { IpcError } from '@shared/types'
import { effortLabel, modelLabel } from '../../state/translate-options'
import { AddTermDialog } from '../AddTermDialog'
import { RetranslateTermDialog } from '../RetranslateTermDialog'
import { ConfirmDialog } from '../ConfirmDialog'
import { GlossaryGrid, type EditEntry, type GlossaryGridRow } from '../GlossaryGrid'
import { JobLog } from '../JobLog'
import { JOB_TITLE, JobProgress } from '../JobProgress'
import { KeyChecklist, type ChecklistItem } from '../KeyChecklist'
import { TermTranslateCard } from '../TermTranslateCard'

const api = window.babel

const GLOSSARY_FILE = 'glossary.csv'

type StatusFilter = 'all' | 'pending' | 'approved'

const FILTERS: readonly StatusFilter[] = ['all', 'pending', 'approved']
const FILTER_LABEL: Record<StatusFilter, string> = { all: '전체', pending: '승인 대기', approved: '승인' }

const SKIP_LABEL: Record<GlossarySkipReason, string> = {
  missing: '파일에 없음',
  changed: '그 사이 바뀜',
  exists: '같은 용어가 있음',
  invalid: '용어가 빔'
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

const sameEntry = (a: GlossaryEntry, b: GlossaryEntry): boolean => JSON.stringify(a) === JSON.stringify(b)

/** 승인이 필요한 용어: 용어 전체가 승인 대기이거나, 승인된 용어에 승인 대기 언어(용어 번역이 채운 칸)가 있다 */
function needsApproval(entry: GlossaryEntry, languages: readonly string[]): boolean {
  return entry.status === 'pending' || entry.pendingLanguages.some((language) => languages.includes(language))
}

function matches(entry: GlossaryEntry, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (needle === '') return true
  return [entry.term, entry.pos, entry.note, entry.reason, ...Object.values(entry.translations)].some((text) =>
    text.toLowerCase().includes(needle)
  )
}

type Props = {
  project: OpenProject
  job: JobView | null
  jobLog: readonly JobLogEntry[]
  onMessage: (text: string) => void
  /** 저장하지 않은 편집이 있는지. 다른 화면으로 갈 때 확인을 받는다. */
  onDirtyChange: (dirty: boolean) => void
}

/**
 * 용어집(glossary.csv). 칸을 고친 뒤 [저장]하면 고친 행만 보낸다 — 메인이 파일을 다시 읽어 행마다 화면이 본 값과
 * 비교하므로, 용어 추출 작업이 도는 중에도 편집할 수 있다. 승인·삭제·추가는 누르는 즉시 저장한다.
 */
export function Glossary({ project, job, jobLog, onMessage, onDirtyChange }: Props): React.JSX.Element {
  const { config } = project
  const lowConfidence = config.review.lowConfidence
  const [view, setView] = useState<GlossaryView | null>(null)
  const [master, setMaster] = useState<MasterRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, GlossaryEntry>>({})
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<TermsScope>('all')
  const [scopeKeys, setScopeKeys] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  /** 재번역 대화상자를 연 행 */
  const [retranslateId, setRetranslateId] = useState<string | null>(null)
  /** 그리드가 스크롤해 보여 줄 행(방금 추가한 용어) */
  const [focusId, setFocusId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<IpcError | null>(null)

  const running = job !== null && job.snapshot.state !== 'done' && job.snapshot.state !== 'cancelled'
  const languages = view?.languages ?? config.targetLanguages

  const load = useCallback(async () => {
    const [glossary, strings] = await Promise.all([api.glossary.list(), api.strings.list(null)])
    if (!glossary.ok) {
      setError(glossary.error)
      return
    }
    setError(strings.ok ? null : strings.error)
    setView(glossary.value)
    if (strings.ok) setMaster(strings.value.rows.map(toMaster))
    const ids = new Set(glossary.value.entries.map((entry) => termKey(entry.term)))
    setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 추출 배치·패널 제안이 후보를 붙이거나 파일이 밖에서 바뀌면 다시 읽는다. 고친 칸은 행별로 남는다.
  useEffect(() => {
    const offWritten = api.project.onDataWritten(({ file }) => {
      if (file === GLOSSARY_FILE) void load()
    })
    const offChanged = api.strings.onFileChanged(({ file }) => {
      if (file === GLOSSARY_FILE || file === 'strings_master.csv') void load()
    })
    return () => {
      offWritten()
      offChanged()
    }
  }, [load])

  const entries = useMemo(() => view?.entries ?? [], [view])

  const allRows: GlossaryGridRow[] = useMemo(() => {
    const drafted = entries.map((base) => {
      const id = termKey(base.term)
      const entry = drafts[id] ?? base
      return { id, base, entry }
    })
    // 이름을 고친 결과가 빈 값이거나 다른 용어와 겹치면 저장할 수 없다
    const counts = new Map<string, number>()
    for (const { entry } of drafted) counts.set(termKey(entry.term), (counts.get(termKey(entry.term)) ?? 0) + 1)
    return drafted.map(({ id, base, entry }) => {
      const key = termKey(entry.term)
      const confidence = parseConfidence(entry.confidence)
      return {
        id,
        base,
        entry,
        dirty: !sameEntry(entry, base),
        selected: selected.has(id),
        low: confidence !== null && confidence < lowConfidence,
        problem: key === '' ? '용어가 비었습니다' : (counts.get(key) ?? 0) > 1 ? '다른 용어와 겹칩니다' : null
      }
    })
  }, [drafts, entries, lowConfidence, selected])

  const rows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          (row.selected || filter === 'all' || (filter === 'pending') === needsApproval(row.entry, languages)) &&
          matches(row.entry, search)
      ),
    [allRows, filter, languages, search]
  )
  const counts = useMemo(() => {
    const pending = allRows.filter((row) => needsApproval(row.entry, languages)).length
    return { all: allRows.length, pending, approved: allRows.length - pending }
  }, [allRows, languages])
  const dirtyRows = allRows.filter((row) => row.dirty)
  const chosen = allRows.filter((row) => row.selected)
  const chosenPending = chosen.filter((row) => needsApproval(row.base, languages))
  const blocked = (list: readonly GlossaryGridRow[]): boolean => list.some((row) => row.problem !== null)

  useEffect(() => {
    onDirtyChange(dirtyRows.length > 0)
  }, [dirtyRows.length, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const termRows = useMemo(
    () => master.filter((row) => row.source.trim() !== '' && (scope === 'all' || scopeKeys.has(row.key))),
    [master, scope, scopeKeys]
  )
  const plan = useMemo(() => ({ rows: termRows.length, batches: buildBatches(termRows, config.batch).length }), [config.batch, termRows])
  const checklist: ChecklistItem[] = useMemo(() => master.map((row) => ({ key: row.key, source: row.source })), [master])

  const onToggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const byId = useMemo(() => new Map(entries.map((entry) => [termKey(entry.term), entry])), [entries])
  const onEdit: EditEntry = useCallback(
    (id, change) => {
      setDrafts((prev) => {
        const base = prev[id] ?? byId.get(id)
        return base ? { ...prev, [id]: change(base) } : prev
      })
    },
    [byId]
  )

  /** 변경을 보내고, 저장된 행의 편집은 비운다. 건너뛴 행은 이유를 알린다. */
  const send = async (changes: { row: GlossaryGridRow | null; change: GlossaryChange }[], verb: string): Promise<void> => {
    if (changes.length === 0) return
    setBusy(true)
    try {
      const result = await api.glossary.update({ changes: changes.map((item) => item.change) })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setView(result.value.view)
      const applied = new Set(result.value.applied)
      const done = changes.flatMap(({ row, change }) => {
        if (!row) return []
        const name = change.next ? change.next.term.trim() : row.base.term
        return applied.has(name) ? [row.id] : []
      })
      setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !done.includes(id))))
      setSelected((prev) => new Set([...prev].filter((id) => !done.includes(id))))
      const parts = [`용어 ${result.value.applied.length}개를 ${verb}.`]
      if (result.value.skipped.length > 0) {
        const reasons = result.value.skipped.map((item) => `${item.term}: ${SKIP_LABEL[item.reason]}`).join(', ')
        parts.push(`건너뜀 ${result.value.skipped.length}개(${reasons}).`)
        if (result.value.skipped.some((item) => item.reason === 'changed')) {
          parts.push('바뀐 행은 지금 파일 내용을 확인한 뒤 다시 저장하세요.')
        }
      }
      onMessage(parts.join(' '))
    } finally {
      setBusy(false)
    }
  }

  const save = (): Promise<void> =>
    send(
      dirtyRows.map((row) => ({ row, change: { original: row.base.term, next: row.entry, expected: row.base } })),
      '저장했습니다'
    )

  const approve = (): Promise<void> =>
    send(
      chosenPending.map((row) => ({
        row,
        change: {
          original: row.base.term,
          // 용어 전체와 승인 대기 언어를 함께 확정한다. 화면에 없는 언어(대상에서 뺀 언어)의 표시는 남긴다
          next: {
            ...row.entry,
            status: 'approved',
            pendingLanguages: row.entry.pendingLanguages.filter((language) => !languages.includes(language))
          },
          expected: row.base
        }
      })),
      '승인했습니다'
    )

  const remove = async (): Promise<void> => {
    setConfirmDelete(false)
    await send(
      chosen.map((row) => ({ row, change: { original: row.base.term, next: null, expected: row.base } })),
      '지웠습니다'
    )
  }

  /** [용어 추가]가 승인 대기로 넣은 용어를 보여 주고 골라 둔다 — 확인한 뒤 [선택 승인]만 누르면 되게. */
  const added = async (result: AddTermResult): Promise<void> => {
    setAdding(false)
    await load()
    const id = termKey(result.entry.term)
    setSelected((prev) => new Set([...prev, id]))
    setFocusId(id)
    const parts = [`"${result.entry.term}" 을 승인 대기로 추가했습니다(원문 ${result.found}행 중 ${result.examples}행 참고).`]
    if (result.conflicts.length > 0) {
      const counts = result.conflicts.map((item) => `${item.language} ${item.keys.length}행`).join(', ')
      parts.push(`기존 번역 중 이 번역과 다른 행이 있습니다(${counts}) — 승인하면 용어집 위반으로 표시됩니다.`)
    }
    onMessage(parts.join(' '))
  }

  /**
   * 재번역 결과를 그 행의 칸에 미저장 편집으로 채운다. 근거·신뢰도도 새 값으로 바꾼다.
   * 사람이 확인하고 [저장]해야 반영된다 — [변경 취소]로 되돌릴 수 있다.
   */
  const retranslated = (row: GlossaryGridRow, result: RetranslateTermResult): void => {
    setRetranslateId(null)
    const changes = languages
      .filter((language) => (result.translations[language] ?? '') !== (row.entry.translations[language] ?? ''))
      .map((language) => `${language} ${row.entry.translations[language] || '(없음)'} → ${result.translations[language] ?? ''}`)
    const noteChanged = result.note.trim() !== row.entry.note.trim()
    if (noteChanged) changes.push(result.note.trim() === '' ? '지침 비움' : '지침 다시 씀')
    onEdit(row.id, (entry) => ({
      ...entry,
      translations: { ...entry.translations, ...result.translations },
      note: result.note,
      reason: result.reason,
      confidence: String(Math.round(result.confidence * 100) / 100)
    }))
    setFocusId(row.id)
    const parts = [
      changes.length > 0
        ? `"${result.term}" 재번역 결과를 칸에 넣었습니다(${changes.join(', ')}). 확인하고 [저장]하세요.`
        : `"${result.term}" 은 지금 번역과 지침이 그대로 제안됐습니다.`
    ]
    if (result.conflicts.length > 0) {
      const counts = result.conflicts.map((item) => `${item.language} ${item.keys.length}행`).join(', ')
      parts.push(`기존 번역 중 새 번역과 다른 행이 있습니다(${counts}).`)
    }
    onMessage(parts.join(' '))
  }

  const discardEdits = (): void => {
    setDrafts({})
    onMessage('고친 칸을 모두 되돌렸습니다.')
  }

  const startExtract = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.glossary.extract({ scope, keys: scope === 'selected' ? [...scopeKeys] : [] })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      onMessage(`용어 추출을 시작했습니다: ${result.value.snapshot.totalRows}행`)
    } finally {
      setBusy(false)
    }
  }

  const startTranslate = async (input: StartTermTranslateInput): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.glossary.translate(input)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      onMessage(`용어 번역을 시작했습니다: 용어 ${result.value.snapshot.totalRows}개 (${input.languages.join(', ')})`)
    } finally {
      setBusy(false)
    }
  }

  const control = async (action: JobControlInput['action']): Promise<void> => {
    const result = await api.jobs.control(action)
    if (!result.ok) setError(result.error)
  }

  const retranslateRow = retranslateId === null ? null : (allRows.find((row) => row.id === retranslateId) ?? null)
  const ownJob = job !== null && (job.kind === 'terms' || job.kind === 'term-translate')
  const ownLog = ownJob ? jobLog.filter((entry) => entry.at >= job.startedAt) : []
  const approvedChosen = chosen.filter((row) => row.base.status === 'approved').length
  const extracted = job !== null && job.kind === 'terms' && job.snapshot.state === 'done'

  return (
    <div className="workbench-screen">
      <h2 className="screen-title">용어집</h2>

      {config.targetLanguages.length === 0 ? (
        <div className="message">대상 언어가 없습니다. 프로젝트 화면에서 정하세요.</div>
      ) : null}

      <section className="card">
        <h3>용어 추출</h3>
        <div className="scope-options">
          <label className={scope === 'all' ? 'scope-option selected' : 'scope-option'}>
            <input type="radio" name="terms-scope" checked={scope === 'all'} disabled={running || busy} onChange={() => setScope('all')} />
            <span>전체 원문</span>
            <span className="scope-count">{master.filter((row) => row.source.trim() !== '').length}</span>
          </label>
          <label className={scope === 'selected' ? 'scope-option selected' : 'scope-option'}>
            <input type="radio" name="terms-scope" checked={scope === 'selected'} disabled={running || busy} onChange={() => setScope('selected')} />
            <span>선택 행</span>
            <span className="scope-count">{scopeKeys.size}</span>
          </label>
        </div>
        <p className="hint">
          모델 {modelLabel(config.translate.model)} · 사고 {effortLabel(config.translate.effort)} · 배치 {config.batch.maxRows}행 /{' '}
          {config.batch.maxSourceChars.toLocaleString()}자 · 작업자 {clampConcurrency(config.batch.concurrency)}
        </p>
        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          <button
            type="button"
            className="primary"
            disabled={running || busy || plan.rows === 0}
            onClick={() => void startExtract()}
          >
            추출 시작
          </button>
          <span className="hint">
            {plan.rows}행 · 배치 {plan.batches}개
            {running && job.kind !== 'terms' ? ` — ${JOB_TITLE[job.kind]} 중` : ''}
          </span>
        </div>
        {extracted ? <p className="hint" style={{ marginTop: 'var(--space-2)' }}>추출이 끝났습니다. 번역은 [용어 번역]으로 채우세요.</p> : null}
      </section>

      {scope === 'selected' ? (
        <section className="card">
          <div className="row checklist-toolbar">
            <strong>용어를 찾을 행</strong>
            <span className="hint">선택 {scopeKeys.size}</span>
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

      <TermTranslateCard
        config={config}
        entries={entries}
        languages={languages}
        chosenTerms={chosen.map((row) => row.base.term)}
        disabled={running || busy}
        blockedBy={running && job.kind !== 'term-translate' ? JOB_TITLE[job.kind] : null}
        onStart={(input) => void startTranslate(input)}
      />

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
      {view && view.duplicates.length > 0 ? (
        <div className="message">
          같은 용어가 여러 행 있습니다: {view.duplicates.join(', ')} — 첫 행만 고칠 수 있습니다.
        </div>
      ) : null}

      <div className="review-filters">
        <div className="filter-chips">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'filter-chip selected' : 'filter-chip'}
              onClick={() => setFilter(value)}
            >
              {FILTER_LABEL[value]}
              <span className="filter-count">{counts[value]}</span>
            </button>
          ))}
        </div>
        <input
          className="filter-search"
          type="search"
          value={search}
          placeholder="용어·번역·지침 검색"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="grid-toolbar">
        <div className="grid-meta">
          {rows.length} / {allRows.length}개 · 선택 {chosen.length}
          {dirtyRows.length > 0 ? ` · 고친 행 ${dirtyRows.length}` : ''}
          {busy ? ' · 저장 중…' : ''}
        </div>
        <div className="row">
          <button type="button" disabled={busy} onClick={() => setAdding(true)}>
            용어 추가
          </button>
          <button
            type="button"
            disabled={busy || rows.length === 0}
            onClick={() => setSelected(new Set([...selected, ...rows.map((row) => row.id)]))}
          >
            보이는 행 선택
          </button>
          <button type="button" disabled={busy || chosen.length === 0} onClick={() => setSelected(new Set())}>
            선택 해제
          </button>
          <button type="button" className="danger" disabled={busy || chosen.length === 0} onClick={() => setConfirmDelete(true)}>
            선택 삭제
          </button>
          <button
            type="button"
            disabled={busy || chosen.length !== 1 || languages.length === 0}
            title={chosen.length === 1 ? '선택한 용어의 번역을 에이전트로 다시 받습니다' : '용어를 하나만 선택하세요'}
            onClick={() => setRetranslateId(chosen[0]?.id ?? null)}
          >
            선택 재번역
          </button>
          <button
            type="button"
            disabled={busy || chosenPending.length === 0 || blocked(chosenPending)}
            title="선택한 승인 대기 용어와 승인 대기 언어를 승인합니다. 고친 칸이 있으면 함께 저장합니다"
            onClick={() => void approve()}
          >
            선택 승인 ({chosenPending.length})
          </button>
          <button type="button" disabled={busy || dirtyRows.length === 0} onClick={discardEdits}>
            변경 취소
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || dirtyRows.length === 0 || blocked(dirtyRows)}
            title={blocked(dirtyRows) ? '빨간 칸의 용어를 먼저 고치세요' : undefined}
            onClick={() => void save()}
          >
            저장{dirtyRows.length > 0 ? ` (${dirtyRows.length})` : ''}
          </button>
        </div>
      </div>

      {view ? (
        <GlossaryGrid rows={rows} languages={languages} disabled={busy} focusId={focusId} onToggle={onToggle} onEdit={onEdit} />
      ) : null}

      {adding ? (
        <AddTermDialog
          languages={languages}
          sourceLanguage={config.sourceLanguage}
          master={master}
          existing={new Set(entries.map((entry) => termKey(entry.term)))}
          onRun={(request) => api.glossary.add(request)}
          onCancelRun={(requestId) => void api.glossary.cancelAgent(requestId)}
          onDone={(result) => void added(result)}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {retranslateRow ? (
        <RetranslateTermDialog
          entry={retranslateRow.entry}
          languages={languages}
          onRun={(request) => api.glossary.retranslate(request)}
          onCancelRun={(requestId) => void api.glossary.cancelAgent(requestId)}
          onDone={(result) => retranslated(retranslateRow, result)}
          onClose={() => setRetranslateId(null)}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="용어 삭제"
          confirmLabel={`${chosen.length}개 삭제`}
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void remove()}
        >
          <p>선택한 용어 {chosen.length}개를 glossary.csv 에서 지웁니다.</p>
          <p className="confirm-quote">{chosen.slice(0, 20).map((row) => row.base.term).join(', ')}{chosen.length > 20 ? ' …' : ''}</p>
          {approvedChosen > 0 ? (
            <p className="hint field-error">승인된 용어 {approvedChosen}개가 포함되어 있습니다.</p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
