import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bulkApproveTargets } from '@core/review/bulk'
import {
  QUICK_FILTERS,
  countQuick,
  matchesFilter,
  presentRuleIds,
  type QuickFilter,
  type ReviewFilter
} from '@core/review/filter'
import type { JobView } from '@shared/schema/jobs'
import { TranslationStatus, type OpenProject } from '@shared/schema/project'
import { QaRuleId, type QaDiagnostic } from '@shared/schema/qa'
import type { BulkApproveResult, RerollCandidate } from '@shared/schema/review'
import type { StringsRow } from '@shared/schema/strings'
import type { IpcError } from '@shared/types'
import { BULK_SKIP_LABEL, QUICK_LABEL, RULE_LABEL } from '../../state/review'
import { ConfirmDialog } from '../ConfirmDialog'
import { ConflictDialog } from '../ConflictDialog'
import { ReviewDetail, type ManualStatus } from '../ReviewDetail'
import { ReviewGrid, type EditingCell, type ReviewRow } from '../ReviewGrid'
import { STATUS_LABEL } from '../StringsGrid'

const api = window.babel

/** 저장 한 번에 보내는 변경. 상태 전이 규칙은 메인(core/status.ts)이 판정한다. */
type Change = { text: string; status: TranslationStatus; note?: string; confidence?: string }

type Conflict = { error: IpcError; keepMine: () => void; reload: () => void; cancel: () => void }

type Reroll = { requestId: string; key: string; startedAt: number }

const EMPTY_FILTER: ReviewFilter = { quick: 'all', status: null, ruleId: null, search: '' }

/** 이 화면이 다시 읽어야 하는 파일 */
function isRelevantFile(file: string, language: string): boolean {
  return file === `translations_${language}.csv` || file === 'strings_master.csv' || file === 'glossary.csv'
}

/** 확인 대화상자에 보여 줄 키 수 */
const BULK_PREVIEW = 12

function describeBulkResult({ approved, skipped }: BulkApproveResult): string {
  const parts = [`${approved.length}행을 승인했습니다.`]
  if (skipped.length > 0) {
    const counts = new Map<string, number>()
    for (const item of skipped) {
      const label = BULK_SKIP_LABEL[item.reason]
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    const reasons = [...counts].map(([label, count]) => `${label} ${count}`).join(' · ')
    parts.push(`${skipped.length}행은 건너뛰었습니다(${reasons}).`)
  }
  return parts.join(' ')
}

/** 다른 화면(내보내기 진단 목록)에서 특정 행을 열 때 */
export type ReviewFocus = { language: string; key: string }

type Props = {
  project: OpenProject
  job: JobView | null
  onMessage: (text: string) => void
  /** 처음 열 때 고를 언어와 행. 화면을 열 때마다 새로 그려지므로 초기값으로만 쓴다 */
  initialFocus?: ReviewFocus | null
}

export function Review({ project, job, onMessage, initialFocus = null }: Props): React.JSX.Element {
  const { config } = project
  const syntax = config.smartStrings
  const lowConfidence = config.review.lowConfidence
  const [language, setLanguage] = useState(initialFocus?.language ?? config.targetLanguages[0] ?? '')
  const [rows, setRows] = useState<StringsRow[]>([])
  const [diagnostics, setDiagnostics] = useState<Record<string, QaDiagnostic[]>>({})
  const [notices, setNotices] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<IpcError | null>(null)
  const [filter, setFilter] = useState<ReviewFilter>(EMPTY_FILTER)
  const [selectedKey, setSelectedKey] = useState<string | null>(initialFocus?.key ?? null)
  const [editing, setEditingState] = useState<EditingCell | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [externalChange, setExternalChange] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Record<string, RerollCandidate[]>>({})
  const [reroll, setReroll] = useState<Reroll | null>(null)
  const [rerollError, setRerollError] = useState<{ key: string; error: IpcError } | null>(null)
  const [confirmApply, setConfirmApply] = useState<RerollCandidate | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)

  // 편집 상태는 blur·키 입력이 같은 순간 두 번 커밋하지 않도록 ref 로도 들고 있는다
  const editingRef = useRef<EditingCell | null>(null)
  const setEditing = useCallback((value: EditingCell | null) => {
    editingRef.current = value
    setEditingState(value)
  }, [])
  /** 편집 중에 들어온 리로드 요청. 편집이 끝나면 처리한다. */
  const pendingReloadRef = useRef(false)

  const load = useCallback(async (target: string) => {
    if (!target) return
    setLoading(true)
    try {
      const [list, qa] = await Promise.all([api.strings.list(target), api.review.runQa(target)])
      if (!list.ok) {
        setError(list.error)
        return
      }
      if (!qa.ok) {
        setError(qa.error)
        return
      }
      setError(null)
      setRows(list.value.rows)
      setDiagnostics(qa.value.diagnostics)
      setNotices(qa.value.notices)
      setExternalChange(null)
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [])

  /** 편집 중이면 미뤘다가 편집이 끝난 뒤 다시 읽는다 — 입력 중인 글을 지우지 않는다. */
  const requestReload = useCallback(
    (reason: string | null) => {
      if (editingRef.current) {
        pendingReloadRef.current = true
        if (reason) setExternalChange(reason)
        return
      }
      void load(language)
    },
    [language, load]
  )

  const flushPendingReload = useCallback(() => {
    if (!pendingReloadRef.current) return
    pendingReloadRef.current = false
    void load(language)
  }, [language, load])

  // 언어를 바꾸거나 project.json(검사 설정)이 바뀌면 처음부터 다시 읽는다
  useEffect(() => {
    void load(language)
  }, [language, config, load])

  useEffect(() => {
    return api.strings.onFileChanged(({ file }) => {
      if (!isRelevantFile(file, language)) return
      if (!editingRef.current) onMessage(`${file} 이 밖에서 바뀌어 다시 읽었습니다.`)
      requestReload(file)
    })
  }, [language, onMessage, requestReload])

  // 번역 작업이 배치를 기록하면 다시 읽는다. 앱이 쓴 파일은 감시자가 알려 주지 않는다.
  useEffect(() => {
    let lastDone = -1
    return api.jobs.onUpdate((view) => {
      if (view.language !== language || view.snapshot.doneRows === lastDone) return
      lastDone = view.snapshot.doneRows
      requestReload(null)
    })
  }, [language, requestReload])

  const items: ReviewRow[] = useMemo(
    () => rows.map((row) => ({ ...row, diagnostics: diagnostics[row.key] ?? [] })),
    [rows, diagnostics]
  )
  const counts = useMemo(() => countQuick(items, lowConfidence), [items, lowConfidence])
  const ruleIds = useMemo(() => presentRuleIds(items), [items])
  const totals = useMemo(() => {
    let errors = 0
    let warnings = 0
    for (const item of items) {
      for (const diagnostic of item.diagnostics) {
        if (diagnostic.severity === 'error') errors += 1
        else warnings += 1
      }
    }
    return { errors, warnings }
  }, [items])

  // 고친 행이 필터에서 빠져도 선택이 바뀔 때까지는 남겨 둔다 — 고치자마자 눈앞에서 사라지지 않게
  const visible = useMemo(
    () => items.filter((item) => item.key === selectedKey || matchesFilter(item, filter, lowConfidence)),
    [items, filter, lowConfidence, selectedKey]
  )
  const selected = items.find((item) => item.key === selectedKey) ?? null

  // 일괄 승인 대상: 지금 목록에 보이는 행 중 조건을 만족하는 초안. 메인이 기록 직전에 다시 확인한다.
  const bulkTargets = useMemo(() => bulkApproveTargets(visible, lowConfidence), [visible, lowConfidence])
  const bulkWithoutConfidence = bulkTargets.filter((item) => item.confidence.trim() === '').length

  const changeFilter = (patch: Partial<ReviewFilter>): void => {
    const next = { ...filter, ...patch }
    setFilter(next)
    const current = items.find((item) => item.key === selectedKey)
    if (current && !matchesFilter(current, next, lowConfidence)) setSelectedKey(null)
  }

  const applySaved = useCallback((key: string, saved: Partial<StringsRow>, found: QaDiagnostic[]) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...saved } : row)))
    setDiagnostics((prev) => {
      const next = { ...prev }
      if (found.length > 0) next[key] = found
      else delete next[key]
      return next
    })
  }, [])

  /**
   * 행 하나를 바로 저장한다. expected 는 이 화면이 마지막으로 본 행 — 디스크의 행이 그 사이 바뀌었으면
   * 메인이 충돌로 돌려준다. 저장에 실패하면 onFail 로 입력을 되살린다.
   */
  const save = useCallback(
    async (row: StringsRow, change: Change, onFail?: () => void, force = false): Promise<boolean> => {
      setSaving(true)
      try {
        const result = await api.review.update({
          language,
          key: row.key,
          ...change,
          expected: { text: row.translation, status: row.status },
          force
        })
        if (result.ok) {
          setError(null)
          applySaved(row.key, result.value.row, result.value.diagnostics)
          return true
        }
        if (result.error.kind === 'conflict') {
          setConflict({
            error: result.error,
            keepMine: () => {
              setConflict(null)
              void save(row, change, onFail, true)
            },
            reload: () => {
              setConflict(null)
              void load(language)
            },
            cancel: () => {
              setConflict(null)
              onFail?.()
            }
          })
          return false
        }
        setError(result.error)
        onFail?.()
        return false
      } finally {
        setSaving(false)
      }
    },
    [applySaved, language, load]
  )

  const startEdit = useCallback(
    (key: string) => {
      const row = rows.find((item) => item.key === key)
      if (!row) return
      setSelectedKey(key)
      setEditing({ key, text: row.translation })
    },
    [rows, setEditing]
  )

  const editChange = useCallback(
    (text: string) => {
      const current = editingRef.current
      if (current) setEditing({ ...current, text })
    },
    [setEditing]
  )

  const cancelEdit = useCallback(() => {
    setEditing(null)
    flushPendingReload()
  }, [flushPendingReload, setEditing])

  const commitEdit = useCallback(() => {
    const current = editingRef.current
    if (!current) return
    setEditing(null)
    const row = rows.find((item) => item.key === current.key)
    if (!row || current.text === row.translation) {
      flushPendingReload()
      return
    }
    // 글을 고치면 초안, 비우면 미번역
    const status: TranslationStatus = current.text.trim() === '' ? 'untranslated' : 'draft'
    void save(row, { text: current.text, status }, () => setEditing(current)).then((saved) => {
      if (saved) onMessage(`${row.key} 을 저장했습니다.`)
      flushPendingReload()
    })
  }, [flushPendingReload, onMessage, rows, save, setEditing])

  const setStatus = (row: StringsRow, status: ManualStatus): void => {
    void save(row, { text: row.translation, status }).then((saved) => {
      if (saved) onMessage(`${row.key} → ${STATUS_LABEL[status] ?? status}`)
    })
  }

  const saveNote = (row: StringsRow, note: string): void => {
    void save(row, { text: row.translation, status: row.status, note }).then((saved) => {
      if (saved) onMessage(`${row.key} 메모를 저장했습니다.`)
    })
  }

  const startReroll = async (row: StringsRow, instruction: string): Promise<void> => {
    const requestId = crypto.randomUUID()
    setRerollError(null)
    setReroll({ requestId, key: row.key, startedAt: Date.now() })
    try {
      const result = await api.review.reroll({ requestId, language, key: row.key, instruction })
      if (!result.ok) {
        if (result.error.kind !== 'cancelled') setRerollError({ key: row.key, error: result.error })
        return
      }
      const candidate = result.value
      setCandidates((prev) => ({ ...prev, [row.key]: [candidate, ...(prev[row.key] ?? [])].slice(0, 5) }))
    } finally {
      setReroll(null)
    }
  }

  const discardCandidate = (candidate: RerollCandidate): void => {
    setCandidates((prev) => ({
      ...prev,
      [candidate.key]: (prev[candidate.key] ?? []).filter((item) => item.requestId !== candidate.requestId)
    }))
  }

  const applyCandidate = (candidate: RerollCandidate): void => {
    const row = rows.find((item) => item.key === candidate.key)
    if (!row) return
    const change: Change = {
      text: candidate.text,
      status: 'draft',
      confidence: String(Math.round(candidate.confidence * 100) / 100),
      ...(candidate.note ? { note: candidate.note } : {})
    }
    void save(row, change).then((saved) => {
      if (!saved) return
      discardCandidate(candidate)
      onMessage(`${row.key} 에 재번역 후보를 적용했습니다(초안).`)
    })
  }

  const approveBulk = async (): Promise<void> => {
    setConfirmBulk(false)
    const requests = bulkTargets.map((row) => ({ key: row.key, expected: { text: row.translation, status: row.status } }))
    if (requests.length === 0) return
    setSaving(true)
    try {
      const result = await api.review.approveMany({ language, rows: requests })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      onMessage(describeBulkResult(result.value))
    } finally {
      setSaving(false)
    }
    await load(language)
  }

  const jobRunningHere =
    job !== null && job.language === language && job.snapshot.state !== 'done' && job.snapshot.state !== 'cancelled'

  if (config.targetLanguages.length === 0) {
    return (
      <div>
        <h2 className="screen-title">검토/QA</h2>
        <div className="card">
          <h3>대상 언어가 없습니다</h3>
          <p className="hint">project.json 의 targetLanguages 에 번역할 언어를 넣어 주세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="review-screen">
      <div className="strings-header">
        <div>
          <h2 className="screen-title">검토/QA</h2>
          <p className="screen-desc">
            번역을 검토하고 QA 진단을 확인합니다. 번역 칸을 고치면 그 행만 바로 저장되고 초안이 됩니다. 오류가 있는
            행은 승인할 수 없고, 내보내기에서도 막힙니다.
          </p>
        </div>
        <div className="row">
          <select
            value={language}
            disabled={loading || editing !== null}
            onChange={(event) => {
              setLanguage(event.target.value)
              setSelectedKey(null)
              setCandidates({})
              setRerollError(null)
            }}
          >
            {config.targetLanguages.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <button type="button" disabled={loading || editing !== null} onClick={() => void load(language)}>
            QA 다시 실행
          </button>
        </div>
      </div>

      {jobRunningHere ? (
        <div className="message">
          이 언어의 번역 작업이 진행 중입니다. 배치가 기록될 때마다 다시 읽습니다. 작업이 시작된 뒤 여기서 고친 행은
          작업이 덮어쓰지 않습니다.
        </div>
      ) : null}
      {externalChange ? (
        <div className="message">{externalChange} 이 바뀌었습니다. 편집을 마치면 다시 읽습니다.</div>
      ) : null}
      {notices.map((notice) => (
        <div className="message" key={notice}>
          {notice}
        </div>
      ))}
      {error ? (
        <div className="message error">
          <strong>{error.message}</strong>
          {error.detail ? <pre>{error.detail}</pre> : null}
        </div>
      ) : null}

      <div className="review-filters">
        <div className="filter-chips">
          {QUICK_FILTERS.map((quick: QuickFilter) => (
            <button
              key={quick}
              type="button"
              className={filter.quick === quick ? 'filter-chip selected' : 'filter-chip'}
              title={
                quick === 'low-confidence'
                  ? `${QUICK_LABEL[quick].hint} (기준 ${lowConfidence} — project.json 의 review.lowConfidence)`
                  : QUICK_LABEL[quick].hint
              }
              onClick={() => changeFilter({ quick })}
            >
              {QUICK_LABEL[quick].label}
              <span className="filter-count">{counts[quick]}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <select
            value={filter.status ?? ''}
            title="상태"
            onChange={(event) => {
              const parsed = TranslationStatus.safeParse(event.target.value)
              changeFilter({ status: parsed.success ? parsed.data : null })
            }}
          >
            <option value="">모든 상태</option>
            {TranslationStatus.options.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status] ?? status}
              </option>
            ))}
          </select>
          <select
            value={filter.ruleId ?? ''}
            title="진단 종류"
            onChange={(event) => {
              const parsed = QaRuleId.safeParse(event.target.value)
              changeFilter({ ruleId: parsed.success ? parsed.data : null })
            }}
          >
            <option value="">모든 진단</option>
            {ruleIds.map((ruleId) => (
              <option key={ruleId} value={ruleId}>
                {RULE_LABEL[ruleId]}
              </option>
            ))}
          </select>
          <input
            className="filter-search"
            type="search"
            value={filter.search}
            placeholder="키·원문·번역·메모 검색"
            onChange={(event) => changeFilter({ search: event.target.value })}
          />
        </div>
      </div>

      <div className="grid-toolbar">
        <div className="grid-meta">
          {visible.length} / {items.length}행 · 오류 {totals.errors}건 · 경고 {totals.warnings}건
          {saving ? ' · 저장 중…' : ''}
          {loading ? ' · 읽는 중…' : ''}
        </div>
        <div className="row">
          <span className="hint">↑↓ 이동 · Enter 편집 · Ctrl+Enter 저장 · Esc 취소</span>
          <button
            type="button"
            disabled={bulkTargets.length === 0 || saving || loading || editing !== null}
            title={`지금 목록에 보이는 초안 중 QA 오류·경고가 없고 신뢰도가 ${lowConfidence} 이상인 행(신뢰도가 없는 행 포함)을 승인합니다`}
            onClick={() => setConfirmBulk(true)}
          >
            초안 일괄 승인 ({bulkTargets.length})
          </button>
        </div>
      </div>

      {loaded ? (
        <ReviewGrid
          rows={visible}
          language={language}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          syntax={syntax}
          lowConfidence={lowConfidence}
          editing={editing}
          disabled={saving}
          onStartEdit={startEdit}
          onEditChange={editChange}
          onCommitEdit={commitEdit}
          onCancelEdit={cancelEdit}
        />
      ) : null}

      {selected ? (
        <ReviewDetail
          key={selected.key}
          row={selected}
          syntax={syntax}
          busy={saving || editing !== null}
          candidates={candidates[selected.key] ?? []}
          rerollStartedAt={reroll?.key === selected.key ? reroll.startedAt : null}
          rerollElsewhere={reroll !== null && reroll.key !== selected.key}
          rerollError={rerollError?.key === selected.key ? rerollError.error : null}
          onStartEdit={() => startEdit(selected.key)}
          onSetStatus={(status) => setStatus(selected, status)}
          onSaveNote={(note) => saveNote(selected, note)}
          onReroll={(instruction) => void startReroll(selected, instruction)}
          onCancelReroll={() => {
            if (reroll) void api.review.cancelReroll(reroll.requestId)
          }}
          onApplyCandidate={(candidate) => {
            if (selected.status === 'approved') setConfirmApply(candidate)
            else applyCandidate(candidate)
          }}
          onDiscardCandidate={discardCandidate}
        />
      ) : loaded && items.length > 0 ? (
        <p className="hint review-detail-empty">행을 고르면 원문·진단·재번역이 여기에 나옵니다.</p>
      ) : null}

      {confirmApply ? (
        <ConfirmDialog
          title="승인된 번역 바꾸기"
          confirmLabel="후보 적용"
          onCancel={() => setConfirmApply(null)}
          onConfirm={() => {
            applyCandidate(confirmApply)
            setConfirmApply(null)
          }}
        >
          <p>
            <code className="token-key">{confirmApply.key}</code> 은 승인된 행입니다. 후보를 적용하면 번역이 바뀌고
            초안으로 돌아갑니다.
          </p>
          <p className="confirm-quote">{confirmApply.text}</p>
        </ConfirmDialog>
      ) : null}

      {confirmBulk ? (
        <ConfirmDialog
          title="초안 일괄 승인"
          confirmLabel={`${bulkTargets.length}행 승인`}
          onCancel={() => setConfirmBulk(false)}
          onConfirm={() => void approveBulk()}
        >
          <p>지금 목록에 보이는 행 중 아래 조건을 모두 만족하는 초안 {bulkTargets.length}행을 승인합니다.</p>
          <ul className="confirm-list">
            <li>상태가 초안</li>
            <li>QA 오류·경고가 하나도 없음</li>
            <li>
              신뢰도 {lowConfidence} 이상
              {bulkWithoutConfidence > 0 ? ` — 신뢰도가 없는 ${bulkWithoutConfidence}행(사람이 고친 초안)도 포함` : ''}
            </li>
          </ul>
          <p className="confirm-quote mono">
            {bulkTargets
              .slice(0, BULK_PREVIEW)
              .map((item) => item.key)
              .join(', ')}
            {bulkTargets.length > BULK_PREVIEW ? ` 외 ${bulkTargets.length - BULK_PREVIEW}행` : ''}
          </p>
          <p className="hint">
            저장 직전에 파일을 다시 읽어 조건을 다시 확인하고, 그 사이 바뀐 행은 건너뜁니다. 승인한 행은 배치 번역이
            덮어쓰지 않습니다. 되돌리려면 행을 골라 [초안]이나 [검토]로 바꾸세요.
          </p>
        </ConfirmDialog>
      ) : null}

      {conflict ? (
        <ConflictDialog
          message={conflict.error.message}
          detail={conflict.error.detail}
          busy={saving}
          onKeepMine={conflict.keepMine}
          onReload={conflict.reload}
          onCancel={conflict.cancel}
        />
      ) : null}
    </div>
  )
}
