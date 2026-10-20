import { useState } from 'react'
import type { CreateProjectInput } from '@shared/schema/project'

type Props = {
  dir: string
  busy: boolean
  onCancel: () => void
  onSubmit: (input: CreateProjectInput) => void
}

/** 새 프로젝트의 project.json 초기값을 입력받는다. */
export function NewProjectDialog({ dir, busy, onCancel, onSubmit }: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [sourceLanguage, setSourceLanguage] = useState('ko')
  const [targets, setTargets] = useState('en, ja')

  const trimmedName = name.trim()
  const trimmedSource = sourceLanguage.trim()
  const targetLanguages = targets
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  const valid = trimmedName.length > 0 && trimmedSource.length > 0

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>새 프로젝트</h3>
        <p className="project-path">{dir}</p>

        <div className="field">
          <label htmlFor="project-name">프로젝트 이름</label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 바벨탑 RPG"
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="source-language">원문 언어 코드</label>
          <input
            id="source-language"
            className="mono"
            value={sourceLanguage}
            onChange={(event) => setSourceLanguage(event.target.value)}
            placeholder="ko"
          />
          <p className="hint">코드는 특정 원문 언어를 전제하지 않습니다. project.json에 저장됩니다.</p>
        </div>

        <div className="field">
          <label htmlFor="target-languages">대상 언어 코드 (쉼표로 구분)</label>
          <input
            id="target-languages"
            className="mono"
            value={targets}
            onChange={(event) => setTargets(event.target.value)}
            placeholder="en, ja"
          />
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button
            type="button"
            className="primary"
            disabled={!valid || busy}
            onClick={() =>
              onSubmit({ dir, name: trimmedName, sourceLanguage: trimmedSource, targetLanguages })
            }
          >
            만들기
          </button>
        </div>
      </div>
    </div>
  )
}
