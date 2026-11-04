import { Fragment, useEffect, useState } from 'react'
import type { GlossaryEntry, RetranslateTermResult } from '@shared/schema/glossary'
import type { IpcError, IpcResult } from '@shared/types'
import { useT } from '../i18n'

export type RetranslateRequest = {
  requestId: string
  term: string
  translations: Record<string, string>
  pos: string
  note: string
  instruction: string
}

type Props = {
  /** 화면이 보고 있는 항목(고친 칸 포함) */
  entry: GlossaryEntry
  languages: readonly string[]
  onRun: (request: RetranslateRequest) => Promise<IpcResult<RetranslateTermResult>>
  onCancelRun: (requestId: string) => void
  onDone: (result: RetranslateTermResult) => void
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
 * 용어 하나 재번역. 원문 예문과 기존 번역, 지금 번역·지침, 지시를 주고 번역과 지침을 다시 받는다(품사는 그대로).
 * 결과는 그 행의 칸에 미저장 편집으로 들어가고, 사람이 [저장]해야 반영된다.
 */
export function RetranslateTermDialog({ entry, languages, onRun, onCancelRun, onDone, onClose }: Props): React.JSX.Element {
  const t = useT()
  const [instruction, setInstruction] = useState('')
  const [run, setRun] = useState<{ requestId: string; startedAt: number } | null>(null)
  const [error, setError] = useState<IpcError | null>(null)
  const elapsed = useElapsedSeconds(run?.startedAt ?? null)

  const start = async (): Promise<void> => {
    if (run) return
    const requestId = crypto.randomUUID()
    setError(null)
    setRun({ requestId, startedAt: Date.now() })
    try {
      const result = await onRun({
        requestId,
        term: entry.term,
        translations: Object.fromEntries(languages.map((language) => [language, entry.translations[language] ?? ''])),
        pos: entry.pos,
        note: entry.note,
        instruction
      })
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
        <h3>{t.retranslateTerm.title}</h3>
        <p className="confirm-quote">{entry.term}</p>
        <dl className="dl" style={{ margin: 'var(--space-3) 0' }}>
          {languages.map((language) => (
            <Fragment key={language}>
              <dt>{t.retranslateTerm.current(language)}</dt>
              <dd>{entry.translations[language]?.trim() || <span className="muted">{t.retranslateTerm.none}</span>}</dd>
            </Fragment>
          ))}
          <dt>{t.retranslateTerm.currentNote}</dt>
          <dd>{entry.note.trim() || <span className="muted">{t.retranslateTerm.none}</span>}</dd>
        </dl>
        <div className="field">
          <label htmlFor="retranslate-instruction">{t.retranslateTerm.instruction}</label>
          <textarea
            id="retranslate-instruction"
            rows={2}
            value={instruction}
            autoFocus
            disabled={run !== null}
            placeholder={t.retranslateTerm.instructionPlaceholder}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <p className="hint">{t.retranslateTerm.hint}</p>
        </div>

        {run ? <p className="hint">{t.retranslateTerm.running(elapsed)}</p> : null}
        {error ? (
          <div className="message error">
            <strong>{error.message}</strong>
            {error.detail ? <pre>{error.detail}</pre> : null}
          </div>
        ) : null}

        <div className="modal-actions">
          {run ? (
            <button type="button" onClick={() => onCancelRun(run.requestId)}>
              {t.retranslateTerm.stop}
            </button>
          ) : (
            <button type="button" onClick={onClose}>
              {t.common.close}
            </button>
          )}
          <button type="button" className="primary" disabled={run !== null || languages.length === 0} onClick={() => void start()}>
            {t.retranslateTerm.run}
          </button>
        </div>
      </div>
    </div>
  )
}
