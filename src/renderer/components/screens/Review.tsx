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
import type { Messages } from '@shared/i18n'
import { useT } from '../../i18n'
import { statusLabel } from '../../state/labels'
import { ConfirmDialog } from '../ConfirmDialog'
import { ConflictDialog } from '../ConflictDialog'
import { ReviewDetail, type ManualStatus } from '../ReviewDetail'
import { ReviewGrid, type EditingCell, type ReviewRow } from '../ReviewGrid'


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

function describeBulkResult({ approved, skipped }: BulkApproveResult, t: Messages): string {
  const parts = [t.reviewScreen.approved(approved.length)]
  if (skipped.length > 0) {
    const counts = new Map<string, number>()
    for (const item of skipped) {
      const label = t.bulkSkip[item.reason]
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    const reasons = [...counts].map(([label, count]) => `${label} ${count}`).join(' · ')
    parts.push(t.reviewScreen.skipped(skipped.length, reasons))
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
  const t = useT()
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
      if (!editingRef.current) onMessage(t.reviewScreen.reloaded(file))
      requestReload(file)
    })
  }, [language, onMessage, requestReload, t])

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
      if (saved) onMessage(t.reviewScreen.saved(row.key))
      flushPendingReload()
    })
  }, [flushPendingReload, onMessage, rows, save, setEditing, t])

  const setStatus = (row: StringsRow, status: ManualStatus): void => {
    void save(row, { text: row.translation, status }).then((saved) => {
      if (saved) onMessage(t.reviewScreen.statusChanged(row.key, t.status[status]))
    })
  }

  const saveNote = (row: StringsRow, note: string): void => {
    void save(row, { text: row.translation, status: row.status, note }).then((saved) => {
      if (saved) onMessage(t.reviewScreen.noteSaved(row.key))
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
      onMessage(t.reviewScreen.candidateApplied(row.key))
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
      onMessage(describeBulkResult(result.value, t))
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
        <h2 className="screen-title">{t.screens.review.label}</h2>
        <div className="card">
          <h3>{t.common.noTargetLanguages}</h3>
          <p className="hint">{t.common.setTargetLanguages}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="review-screen">
      <div className="strings-header">
        <h2 className="screen-title">{t.screens.review.label}</h2>
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
            {t.reviewScreen.rerunQa}
          </button>
        </div>
      </div>

      {jobRunningHere ? (
        <div className="message">{t.reviewScreen.jobRunning}</div>
      ) : null}
      {externalChange ? (
        <div className="message">{t.reviewScreen.externalChange(externalChange)}</div>
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
                  ? t.reviewScreen.threshold(t.quickFilter[quick].hint, lowConfidence)
                  : t.quickFilter[quick].hint
              }
              onClick={() => changeFilter({ quick })}
            >
              {t.quickFilter[quick].label}
              <span className="filter-count">{counts[quick]}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <select
            value={filter.status ?? ''}
            title={t.reviewScreen.statusFilter}
            onChange={(event) => {
              const parsed = TranslationStatus.safeParse(event.target.value)
              changeFilter({ status: parsed.success ? parsed.data : null })
            }}
          >
            <option value="">{t.reviewScreen.allStatuses}</option>
            {TranslationStatus.options.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status, t)}
              </option>
            ))}
          </select>
          <select
            value={filter.ruleId ?? ''}
            title={t.reviewScreen.ruleFilter}
            onChange={(event) => {
              const parsed = QaRuleId.safeParse(event.target.value)
              changeFilter({ ruleId: parsed.success ? parsed.data : null })
            }}
          >
            <option value="">{t.reviewScreen.allRules}</option>
            {ruleIds.map((ruleId) => (
              <option key={ruleId} value={ruleId}>
                {t.qaRule[ruleId]}
              </option>
            ))}
          </select>
          <input
            className="filter-search"
            type="search"
            value={filter.search}
            placeholder={t.reviewScreen.search}
            onChange={(event) => changeFilter({ search: event.target.value })}
          />
        </div>
      </div>

      <div className="grid-toolbar">
        <div className="grid-meta">
          {t.reviewScreen.meta(visible.length, items.length, totals.errors, totals.warnings)}
          {saving ? t.reviewScreen.saving : ''}
          {loading ? t.reviewScreen.loading : ''}
        </div>
        <div className="row">
          <button
            type="button"
            disabled={bulkTargets.length === 0 || saving || loading || editing !== null}
            title={t.reviewScreen.bulkHint(lowConfidence)}
            onClick={() => setConfirmBulk(true)}
          >
            {t.reviewScreen.bulk(bulkTargets.length)}
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
        <p className="hint review-detail-empty">{t.reviewScreen.pickRow}</p>
      ) : null}

      {confirmApply ? (
        <ConfirmDialog
          title={t.reviewScreen.replaceApproved}
          confirmLabel={t.reviewScreen.applyCandidate}
          onCancel={() => setConfirmApply(null)}
          onConfirm={() => {
            applyCandidate(confirmApply)
            setConfirmApply(null)
          }}
        >
          <p>
            <code className="token-key">{confirmApply.key}</code>
            {t.reviewScreen.replaceApprovedBody}
          </p>
          <p className="confirm-quote">{confirmApply.text}</p>
        </ConfirmDialog>
      ) : null}

      {confirmBulk ? (
        <ConfirmDialog
          title={t.reviewScreen.bulkTitle}
          confirmLabel={t.reviewScreen.bulkConfirm(bulkTargets.length)}
          onCancel={() => setConfirmBulk(false)}
          onConfirm={() => void approveBulk()}
        >
          <p>{t.reviewScreen.bulkBody(bulkTargets.length)}</p>
          <ul className="confirm-list">
            <li>{t.reviewScreen.bulkDraft}</li>
            <li>{t.reviewScreen.bulkNoIssues}</li>
            <li>
              {t.reviewScreen.bulkConfidence(lowConfidence)}
              {bulkWithoutConfidence > 0 ? t.reviewScreen.bulkWithoutConfidence(bulkWithoutConfidence) : ''}
            </li>
          </ul>
          <p className="confirm-quote mono">
            {bulkTargets
              .slice(0, BULK_PREVIEW)
              .map((item) => item.key)
              .join(', ')}
            {bulkTargets.length > BULK_PREVIEW ? t.reviewScreen.bulkMore(bulkTargets.length - BULK_PREVIEW) : ''}
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
