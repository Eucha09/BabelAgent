import { useState } from 'react'
import { validateNewKey } from '@core/strings/keys'
import { useT } from '../i18n'

export type NewRowInput = { key: string; source: string; context: string }

type Props = {
  existingKeys: ReadonlySet<string>
  /** 이 키 바로 아래에 넣는다. null이면 맨 끝. */
  insertAfterKey: string | null
  onCancel: () => void
  onAdd: (input: NewRowInput) => void
}

/** 원문 행 추가. 키는 번역 연결의 기준이라 저장 후에는 그리드에서 바꿀 수 없다. */
export function AddRowDialog({
  existingKeys,
  insertAfterKey,
  onCancel,
  onAdd
}: Props): React.JSX.Element {
  const t = useT()
  const [key, setKey] = useState('')
  const [source, setSource] = useState('')
  const [context, setContext] = useState('')
  const [touched, setTouched] = useState(false)

  const trimmed = key.trim()
  const problem = validateNewKey(trimmed, existingKeys)

  const submit = (): void => {
    setTouched(true)
    if (problem) return
    onAdd({ key: trimmed, source, context })
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{t.addRow.title}</h3>
        <p className="hint" style={{ marginBottom: 'var(--space-3)' }}>
          {insertAfterKey ? (
            <>
              {t.addRow.insertAfterBefore}
              <code>{insertAfterKey}</code>
              {t.addRow.insertAfterAfter}
            </>
          ) : (
            t.addRow.insertEnd
          )}
        </p>

        <div className="field">
          <label htmlFor="new-key">{t.columns.key} *</label>
          <input
            id="new-key"
            className="mono"
            value={key}
            autoFocus
            placeholder={t.addRow.keyPlaceholder}
            onChange={(event) => {
              setKey(event.target.value)
              setTouched(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                submit()
              }
            }}
          />
          {touched && problem ? <p className="hint field-error">{t.addRow.problem[problem]}</p> : null}
          <p className="hint">{t.addRow.keyLocked}</p>
        </div>

        <div className="field">
          <label htmlFor="new-source">{t.columns.source}</label>
          <textarea
            id="new-source"
            rows={3}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="new-context">{t.columns.context}</label>
          <textarea
            id="new-context"
            rows={2}
            value={context}
            placeholder={t.addRow.contextPlaceholder}
            onChange={(event) => setContext(event.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button type="button" className="primary" onClick={submit} disabled={touched && problem !== null}>
            {t.addRow.add}
          </button>
        </div>
      </div>
    </div>
  )
}
