import { useState } from 'react'
import { validateNewKey, type KeyProblem } from '@core/strings/keys'

export type NewRowInput = { key: string; source: string; context: string }

type Props = {
  existingKeys: ReadonlySet<string>
  /** 이 키 바로 아래에 넣는다. null이면 맨 끝. */
  insertAfterKey: string | null
  onCancel: () => void
  onAdd: (input: NewRowInput) => void
}

const PROBLEM_TEXT: Record<KeyProblem, string> = {
  empty: '키를 입력하세요.',
  duplicate: '이미 있는 키입니다.',
  newline: '키에 줄바꿈을 넣을 수 없습니다.'
}

/** 원문 행 추가. 키는 번역 연결의 기준이라 저장 후에는 그리드에서 바꿀 수 없다. */
export function AddRowDialog({
  existingKeys,
  insertAfterKey,
  onCancel,
  onAdd
}: Props): React.JSX.Element {
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
        <h3>행 추가</h3>
        <p className="hint" style={{ marginBottom: 'var(--space-3)' }}>
          {insertAfterKey ? (
            <>
              <code>{insertAfterKey}</code> 바로 아래에 넣습니다.
            </>
          ) : (
            '맨 끝에 넣습니다.'
          )}
        </p>

        <div className="field">
          <label htmlFor="new-key">키 *</label>
          <input
            id="new-key"
            className="mono"
            value={key}
            autoFocus
            placeholder="예: ui.options.title"
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
          {touched && problem ? <p className="hint field-error">{PROBLEM_TEXT[problem]}</p> : null}
          <p className="hint">저장한 뒤에는 키를 바꿀 수 없습니다.</p>
        </div>

        <div className="field">
          <label htmlFor="new-source">원문</label>
          <textarea
            id="new-source"
            rows={3}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="new-context">컨텍스트</label>
          <textarea
            id="new-context"
            rows={2}
            value={context}
            placeholder="이 문장이 나오는 상황"
            onChange={(event) => setContext(event.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="primary" onClick={submit} disabled={touched && problem !== null}>
            추가
          </button>
        </div>
      </div>
    </div>
  )
}
