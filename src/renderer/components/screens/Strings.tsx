import { useCallback, useEffect, useState } from 'react'
import type {
  ColumnMapping,
  ImportPreview,
  ImportSummary,
  MasterRow,
  StringsRow,
  StringsView
} from '@shared/schema/strings'
import type { IpcError } from '@shared/types'
import { ConflictDialog } from '../ConflictDialog'
import { ImportDialog } from '../ImportDialog'
import { StringsGrid, type EditableField } from '../StringsGrid'

const api = window.babel

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

  const onEdit = useCallback((key: string, field: EditableField, value: string) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
    setDirty(true)
  }, [])

  const save = useCallback(
    async (force: boolean) => {
      setBusy(true)
      try {
        const current = rows.map(toMasterRow)
        const result = await api.strings.save({ rows: current, force })
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
        const stale = result.value.staleMarked
        onMessage(stale > 0 ? `저장했습니다. ${stale}개 번역을 stale로 표시했습니다.` : '저장했습니다.')
        await load(language)
      } finally {
        setBusy(false)
      }
    },
    [language, load, onMessage, rows]
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
          <button type="button" onClick={startImport} disabled={busy}>
            원문 가져오기
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

      {rows.length === 0 && !busy ? (
        <div className="card">
          <h3>원문이 없습니다</h3>
          <p className="hint">
            [원문 가져오기]로 CSV를 불러오면 strings_master.csv가 만들어집니다. 키 열과 원문 열만
            지정하면 됩니다.
          </p>
        </div>
      ) : (
        <>
          <div className="grid-meta">
            {rows.length}행{language ? ` · 번역 언어 ${language}` : ' · 대상 언어 없음'}
          </div>
          <StringsGrid rows={rows} language={language} onEdit={onEdit} />
        </>
      )}

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
