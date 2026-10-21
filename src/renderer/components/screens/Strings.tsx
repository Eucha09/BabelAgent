import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ColumnMapping,
  ImportPreview,
  ImportSummary,
  MasterRow,
  StringsRow,
  StringsView
} from '@shared/schema/strings'
import type { IpcError } from '@shared/types'
import { insertAfter, moveByOffset, moveRelative, type DropPosition } from '@core/strings/order'
import { AddRowDialog, type NewRowInput } from '../AddRowDialog'
import { ConfirmDialog } from '../ConfirmDialog'
import { ConflictDialog } from '../ConflictDialog'
import { ImportDialog } from '../ImportDialog'
import { STATUS_LABEL, StringsGrid, type EditableField } from '../StringsGrid'

const api = window.babel

function sameOrder(a: readonly StringsRow[], b: readonly StringsRow[]): boolean {
  return a.length === b.length && a.every((row, index) => row.key === b[index]?.key)
}

function toMasterRow(row: StringsRow): MasterRow {
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

type Conflict = {
  error: IpcError
  /** 사용자가 덮어쓰기를 고르면 force로 다시 실행할 동작. */
  retry: (force: boolean) => Promise<void>
}

export function Strings({ onMessage }: { onMessage: (text: string) => void }): React.JSX.Element {
  const [view, setView] = useState<StringsView | null>(null)
  const [rows, setRows] = useState<StringsRow[]>([])
  const [language, setLanguage] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<IpcError | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [externalChange, setExternalChange] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  /** 저장 전 새 행. 저장하면 비운다. */
  const [newKeys, setNewKeys] = useState<ReadonlySet<string>>(new Set())
  const [adding, setAdding] = useState(false)
  /** 저장하면 원문과 모든 번역 파일에서 지울 키. */
  const [deletedKeys, setDeletedKeys] = useState<ReadonlySet<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const load = useCallback(
    async (requested: string | null) => {
      setBusy(true)
      try {
        const result = await api.strings.list(requested)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setError(null)
        setView(result.value)
        setRows(result.value.rows)
        setLanguage(result.value.language)
        setNewKeys(new Set())
        setDeletedKeys(new Set())
        setDirty(false)
        setExternalChange(null)
      } finally {
        setBusy(false)
      }
    },
    []
  )

  useEffect(() => {
    void load(null)
  }, [load])

  // 외부 변경: 미저장 변경이 없으면 자동으로 다시 읽고, 있으면 알리기만 한다
  useEffect(() => {
    return api.strings.onFileChanged(({ file }) => {
      if (dirty) {
        setExternalChange(file)
        return
      }
      onMessage(`${file} 이 밖에서 바뀌어 다시 읽었습니다.`)
      void load(language)
    })
  }, [dirty, language, load, onMessage])

  // 번역 작업이 배치를 기록하면 번역 칸과 상태가 바뀐다. 편집 중이 아니면 다시 읽는다.
  // 앱이 직접 쓴 파일은 감시자가 알려 주지 않으므로 작업 이벤트를 따로 듣는다.
  useEffect(() => {
    let lastDone = -1
    return api.jobs.onUpdate((view) => {
      const done = view.snapshot.doneRows
      if (done === lastDone) return
      lastDone = done
      if (!dirty && view.language === language) void load(language)
    })
  }, [dirty, language, load])

  const onEdit = useCallback((key: string, field: EditableField, value: string) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
    setDirty(true)
  }, [])


  const keySet = useMemo(() => new Set(rows.map((row) => row.key)), [rows])
  const selectedIndex = selectedKey === null ? -1 : rows.findIndex((row) => row.key === selectedKey)

  const addRow = useCallback(
    (input: NewRowInput) => {
      const row: StringsRow = {
        key: input.key,
        source: input.source,
        context: input.context,
        ui_type: '',
        max_len: '',
        vars: '',
        tags: '',
        // 해시는 저장할 때 메인이 계산한다
        source_hash: '',
        translation: '',
        status: 'untranslated',
        confidence: '',
        note: '',
        source_snapshot: ''
      }
      setRows(insertAfter(rows, row, selectedIndex >= 0 ? selectedKey : null))
      setNewKeys(new Set([...newKeys, input.key]))
      setSelectedKey(input.key)
      setDirty(true)
      setAdding(false)
    },
    [newKeys, rows, selectedIndex, selectedKey]
  )

  const moveBy = useCallback(
    (key: string, offset: -1 | 1) => {
      const next = moveByOffset(rows, key, offset)
      if (sameOrder(rows, next)) return
      setRows(next)
      setDirty(true)
    },
    [rows]
  )

  const moveTo = useCallback(
    (key: string, targetKey: string, position: DropPosition) => {
      const next = moveRelative(rows, key, targetKey, position)
      if (sameOrder(rows, next)) return
      setRows(next)
      setSelectedKey(key)
      setDirty(true)
    },
    [rows]
  )

  /** 행을 목록에서 빼고 그 자리의 다음 행을 선택한다. 연달아 지우거나 옮기기 쉽게. */
  const dropRow = useCallback(
    (key: string) => {
      const index = rows.findIndex((row) => row.key === key)
      const remaining = rows.filter((row) => row.key !== key)
      setRows(remaining)
      setSelectedKey(remaining[Math.min(index, remaining.length - 1)]?.key ?? null)
    },
    [rows]
  )

  /**
   * 저장 전 새 행은 디스크에 아무것도 없으니 바로 지운다.
   * 저장된 행은 확인을 받고, 저장할 때 원문과 모든 번역 파일에서 지운다.
   */
  const deleteRow = useCallback(
    (key: string) => {
      if (newKeys.has(key)) {
        const nextNew = new Set(newKeys)
        nextNew.delete(key)
        setNewKeys(nextNew)
        dropRow(key)
        return
      }
      setPendingDelete(key)
    },
    [dropRow, newKeys]
  )

  const confirmDelete = useCallback(() => {
    if (pendingDelete === null) return
    dropRow(pendingDelete)
    setDeletedKeys(new Set([...deletedKeys, pendingDelete]))
    setDirty(true)
    setPendingDelete(null)
  }, [deletedKeys, dropRow, pendingDelete])

  const createMaster = useCallback(async () => {
    setBusy(true)
    try {
      const result = await api.strings.create()
      if (!result.ok) {
        setError(result.error)
        return
      }
      onMessage('strings_master.csv 를 만들었습니다.')
      await load(language)
    } finally {
      setBusy(false)
    }
  }, [language, load, onMessage])

  const save = useCallback(
    async (force: boolean) => {
      setBusy(true)
      try {
        const current = rows.map(toMasterRow)
        const result = await api.strings.save({ rows: current, deletedKeys: [...deletedKeys], force })
        if (!result.ok) {
          if (result.error.kind === 'conflict') {
            setConflict({ error: result.error, retry: save })
            return
          }
          setError(result.error)
          return
        }
        setConflict(null)
        setError(null)
        const { staleMarked, removedRows, removedTranslations } = result.value
        const parts = ['저장했습니다.']
        if (removedRows > 0) {
          parts.push(`${removedRows}개 행을 지우고 번역 ${removedTranslations}개를 함께 지웠습니다.`)
        }
        if (staleMarked > 0) parts.push(`${staleMarked}개 번역을 stale로 표시했습니다.`)
        onMessage(parts.join(' '))
        await load(language)
      } finally {
        setBusy(false)
      }
    },
    [deletedKeys, language, load, onMessage, rows]
  )

  const startImport = useCallback(async () => {
    setBusy(true)
    try {
      const result = await api.strings.importPreview()
      if (!result.ok) {
        if (result.error.kind !== 'cancelled') setError(result.error)
        return
      }
      setSummary(null)
      setPreview(result.value)
    } finally {
      setBusy(false)
    }
  }, [])

  const runImport = useCallback(
    async (mapping: ColumnMapping, filePath: string, force: boolean) => {
      setBusy(true)
      try {
        const result = await api.strings.import({ filePath, mapping, force })
        if (!result.ok) {
          if (result.error.kind === 'conflict') {
            setConflict({
              error: result.error,
              retry: (next) => runImport(mapping, filePath, next)
            })
            return
          }
          setError(result.error)
          return
        }
        setConflict(null)
        setPreview(null)
        setError(null)
        setSummary(result.value)
        onMessage(
          `가져오기 완료: 추가 ${result.value.added} · 변경 ${result.value.changed} · 유지 ${result.value.unchanged}`
        )
        await load(language)
      } finally {
        setBusy(false)
      }
    },
    [language, load, onMessage]
  )

  const notices = view?.notices ?? []
  const pendingRow = pendingDelete === null ? null : (rows.find((row) => row.key === pendingDelete) ?? null)

  return (
    <div className="strings-screen">
      <div className="strings-header">
        <div>
          <h2 className="screen-title">원문</h2>
          <p className="screen-desc">
            strings_master.csv가 원본입니다. 원문과 메타데이터를 고치고 저장하면 CSV에 바로
            반영됩니다.
          </p>
        </div>
        <div className="row">
          {view && view.languages.length > 0 ? (
            <select
              value={language ?? ''}
              disabled={busy || dirty}
              title={dirty ? '저장한 뒤에 언어를 바꿀 수 있습니다' : '보여줄 번역 언어'}
              onChange={(event) => {
                setLanguage(event.target.value)
                void load(event.target.value)
              }}
            >
              {view.languages.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={startImport}
            disabled={busy || dirty}
            title={dirty ? '저장한 뒤에 가져올 수 있습니다' : 'CSV에서 원문 가져오기'}
          >
            원문 가져오기
          </button>
          <button
            type="button"
            onClick={() => setConfirmDiscard(true)}
            disabled={busy || !dirty}
            title="저장하지 않은 변경을 모두 버리고 파일을 다시 읽습니다"
          >
            변경 취소
          </button>
          <button type="button" className="primary" onClick={() => void save(false)} disabled={busy || !dirty}>
            저장{dirty ? ' *' : ''}
          </button>
        </div>
      </div>

      {notices.map((notice) => (
        <div className="message" key={notice.file}>
          {notice.file} 은 {notice.encoding.toUpperCase()}로 읽었습니다. 저장은 UTF-8로 합니다.
        </div>
      ))}

      {externalChange ? (
        <div className="message error">
          {externalChange} 이 앱 밖에서 바뀌었습니다. 편집 중이라 자동으로 다시 읽지 않았습니다.
          저장하면 충돌을 확인합니다.
        </div>
      ) : null}

      {error ? (
        <div className="message error">
          <strong>{error.message}</strong>
          {error.detail ? <pre>{error.detail}</pre> : null}
        </div>
      ) : null}

      {summary ? (
        <div className="message ok">
          <strong>가져오기 결과</strong>
          <dl className="dl" style={{ marginTop: 'var(--space-2)' }}>
            <dt>추가</dt>
            <dd>{summary.added}</dd>
            <dt>원문 변경</dt>
            <dd>{summary.changed}</dd>
            <dt>그대로</dt>
            <dd>{summary.unchanged}</dd>
            <dt>stale 표시</dt>
            <dd>{summary.staleMarked}</dd>
            <dt>이번 파일에 없음</dt>
            <dd>
              {summary.missing.length === 0
                ? '0'
                : `${summary.missing.length} (${summary.missing.slice(0, 5).join(', ')}${summary.missing.length > 5 ? ' …' : ''}) — 지우지 않았습니다`}
            </dd>
            <dt>중복 키</dt>
            <dd>{summary.duplicates.length === 0 ? '0' : summary.duplicates.join(', ')}</dd>
            <dt>빈 키 행</dt>
            <dd>{summary.emptyKeys}</dd>
          </dl>
        </div>
      ) : null}

      {view !== null && rows.length === 0 ? (
        <div className="card">
          {view.masterExists ? (
            <>
              <h3>원문이 비어 있습니다</h3>
              <p className="hint">[행 추가]로 한 줄씩 넣거나 [원문 가져오기]로 CSV를 불러오세요.</p>
              <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                <button type="button" className="primary" onClick={() => setAdding(true)} disabled={busy}>
                  행 추가
                </button>
              </div>
            </>
          ) : (
            <>
              <h3>원문 파일이 없습니다</h3>
              <p className="hint">
                빈 strings_master.csv를 만들어 행을 직접 추가하거나, [원문 가져오기]로 기존 CSV를
                불러올 수 있습니다. 행을 추가하고 저장해도 파일이 만들어집니다.
              </p>
              <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                <button type="button" className="primary" onClick={() => void createMaster()} disabled={busy}>
                  빈 원문 파일 만들기
                </button>
                <button type="button" onClick={() => setAdding(true)} disabled={busy}>
                  행 추가
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid-toolbar">
            <div className="grid-meta">
              {rows.length}행{language ? ` · 번역 언어 ${language}` : ' · 대상 언어 없음'}
              {deletedKeys.size > 0 ? <span className="pending-delete">{` · 삭제 대기 ${deletedKeys.size}`}</span> : null}
              {selectedIndex >= 0 ? (
                <>
                  {' · 선택 '}
                  <code>{selectedKey}</code>
                </>
              ) : null}
            </div>
            <div className="row">
              <button type="button" onClick={() => setAdding(true)} disabled={busy}>
                행 추가
              </button>
              <button
                type="button"
                title="선택한 행을 위로 (Alt+↑)"
                disabled={busy || selectedIndex <= 0}
                onClick={() => selectedKey && moveBy(selectedKey, -1)}
              >
                ↑ 위로
              </button>
              <button
                type="button"
                title="선택한 행을 아래로 (Alt+↓)"
                disabled={busy || selectedIndex < 0 || selectedIndex >= rows.length - 1}
                onClick={() => selectedKey && moveBy(selectedKey, 1)}
              >
                ↓ 아래로
              </button>
              <button
                type="button"
                title="선택한 행 삭제"
                disabled={busy || selectedIndex < 0}
                onClick={() => selectedKey && deleteRow(selectedKey)}
              >
                행 삭제
              </button>
            </div>
          </div>
          <StringsGrid
            rows={rows}
            language={language}
            newKeys={newKeys}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onEdit={onEdit}
            onMove={moveTo}
            onMoveBy={moveBy}
          />
        </>
      )}

      {pendingDelete !== null ? (
        <ConfirmDialog
          title="행 삭제"
          confirmLabel="삭제"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        >
          <p>
            <code className="token-key">{pendingDelete}</code>
          </p>
          {pendingRow?.source ? <p className="confirm-quote">{pendingRow.source}</p> : null}
          {pendingRow && pendingRow.translation !== '' ? (
            <p className="hint">
              {language} 번역: {pendingRow.translation} ({STATUS_LABEL[pendingRow.status] ?? pendingRow.status})
            </p>
          ) : null}
          {pendingRow?.status === 'approved' ? (
            <p className="hint field-error">승인된 번역이 함께 지워집니다.</p>
          ) : null}
          <p className="hint">
            저장하면 strings_master.csv와 폴더의 모든 번역 파일(translations_*.csv)에서 이 키의 행을
            지웁니다. 저장하기 전에는 [변경 취소]로 되돌릴 수 있습니다.
          </p>
        </ConfirmDialog>
      ) : null}

      {confirmDiscard ? (
        <ConfirmDialog
          title="변경 취소"
          confirmLabel="변경 버리기"
          danger
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false)
            onMessage('저장하지 않은 변경을 버렸습니다.')
            void load(language)
          }}
        >
          <p className="hint">
            저장하지 않은 편집, 추가한 행, 순서 변경, 삭제 대기를 모두 버리고 디스크의 파일을 다시
            읽습니다.
          </p>
        </ConfirmDialog>
      ) : null}

      {adding ? (
        <AddRowDialog
          existingKeys={keySet}
          insertAfterKey={selectedIndex >= 0 ? selectedKey : null}
          onCancel={() => setAdding(false)}
          onAdd={addRow}
        />
      ) : null}

      {preview ? (
        <ImportDialog
          preview={preview}
          busy={busy}
          onCancel={() => setPreview(null)}
          onConfirm={(mapping) => void runImport(mapping, preview.filePath, false)}
        />
      ) : null}

      {conflict ? (
        <ConflictDialog
          message={conflict.error.message}
          detail={conflict.error.detail}
          busy={busy}
          onKeepMine={() => void conflict.retry(true)}
          onReload={() => {
            setConflict(null)
            void load(language)
          }}
          onCancel={() => setConflict(null)}
        />
      ) : null}
    </div>
  )
}
