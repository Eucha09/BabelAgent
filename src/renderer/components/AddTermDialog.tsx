import { useEffect, useMemo, useState } from 'react'
import { termKey } from '@core/glossary/entries'
import { findTermUsages } from '@core/terms/addition'
import type { AddTermResult } from '@shared/schema/glossary'
import type { MasterRow } from '@shared/schema/strings'
import type { IpcError, IpcResult } from '@shared/types'

export type AddTermRequest = { requestId: string; term: string; pos: string; note: string; strict: boolean }

type Props = {
  languages: readonly string[]
  sourceLanguage: string
  /** 원문 행. 입력하는 동안 그 용어가 몇 행에 나오는지 바로 보여 준다 */
  master: readonly MasterRow[]
  /** 이미 있는 용어(대소문자 무시) */
  existing: ReadonlySet<string>
  onRun: (request: AddTermRequest) => Promise<IpcResult<AddTermResult>>
  onCancelRun: (requestId: string) => void
  onDone: (result: AddTermResult) => void
  onClose: () => void
}

function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000))
}

/**
 * 용어 추가. 원문에서 그 용어가 쓰인 행을 찾아 에이전트가 대상 언어별 번역을 채우고,
 * 비워 둔 품사·지침도 채운다. 결과는 승인 대기로 들어가 그리드에서 확인하고 승인한다.
 * 원문에 없는 용어는 추가하지 않는다.
 */
export function AddTermDialog({
  languages,
  sourceLanguage,
  master,
  existing,
  onRun,
  onCancelRun,
  onDone,
  onClose
}: Props): React.JSX.Element {
  const [term, setTerm] = useState('')
  const [pos, setPos] = useState('')
  const [note, setNote] = useState('')
  const [strict, setStrict] = useState(false)
  const [run, setRun] = useState<{ requestId: string; startedAt: number } | null>(null)
  const [error, setError] = useState<IpcError | null>(null)
  const elapsed = useElapsedSeconds(run?.startedAt ?? null)

  const trimmed = term.trim()
  const found = useMemo(
    () => (trimmed === '' ? 0 : findTermUsages(trimmed, master, sourceLanguage).length),
    [master, sourceLanguage, trimmed]
  )
  const problem =
    trimmed === ''
      ? null
      : existing.has(termKey(trimmed))
        ? '이미 용어집에 있는 용어입니다.'
        : found === 0
          ? '원문에서 찾지 못했습니다. 원문에 나오는 표기 그대로 입력하세요.'
          : null
  const canRun = run === null && trimmed !== '' && problem === null && languages.length > 0

  const start = async (): Promise<void> => {
    if (!canRun) return
    const requestId = crypto.randomUUID()
    setError(null)
    setRun({ requestId, startedAt: Date.now() })
    try {
      const result = await onRun({ requestId, term: trimmed, pos, note, strict })
      if (result.ok) {
        onDone(result.value)
        return
      }
      if (result.error.kind !== 'cancelled') setError(result.error)
    } finally {
      setRun(null)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>용어 추가</h3>
        <p className="hint" style={{ marginBottom: 'var(--space-3)' }}>
          에이전트가 {languages.join(', ') || '대상 언어'} 번역을 채워 승인 대기로 넣습니다.
        </p>
        <div className="field">
          <label htmlFor="new-term">원문 용어 *</label>
          <input
            id="new-term"
            value={term}
            autoFocus
            disabled={run !== null}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void start()
              }
            }}
          />
          {problem ? (
            <p className="hint field-error">{problem}</p>
          ) : trimmed !== '' ? (
            <p className="hint">원문 {found}행에서 찾았습니다.</p>
          ) : null}
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="new-term-pos">품사·분류 (선택)</label>
            <input
              id="new-term-pos"
              value={pos}
              disabled={run !== null}
              placeholder="비우면 에이전트가 채움"
              onChange={(event) => setPos(event.target.value)}
            />
          </div>
          <label className="check" style={{ alignSelf: 'end', marginBottom: 'var(--space-3)' }}>
            <input type="checkbox" checked={strict} disabled={run !== null} onChange={(event) => setStrict(event.target.checked)} />
            <span>strict — 승인 후 어기면 오류</span>
          </label>
        </div>
        <div className="field">
          <label htmlFor="new-term-note">사용 지침 (선택)</label>
          <textarea
            id="new-term-note"
            rows={2}
            value={note}
            disabled={run !== null}
            placeholder="비우면 에이전트가 채움. 예: 로마자 그대로 쓴다"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {run ? <p className="hint">에이전트가 번역을 채우는 중… {elapsed}초</p> : null}
        {error ? (
          <div className="message error">
            <strong>{error.message}</strong>
            {error.detail ? <pre>{error.detail}</pre> : null}
          </div>
        ) : null}

        <div className="modal-actions">
          {run ? (
            <button type="button" onClick={() => onCancelRun(run.requestId)}>
              중단
            </button>
          ) : (
            <button type="button" onClick={onClose}>
              닫기
            </button>
          )}
          <button type="button" className="primary" disabled={!canRun} onClick={() => void start()}>
            에이전트로 추가
          </button>
        </div>
      </div>
    </div>
  )
}
