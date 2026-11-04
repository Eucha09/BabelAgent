import { useState } from 'react'
import type { CreateProjectInput } from '@shared/schema/project'
import { useT } from '../i18n'
import { LanguageMultiSelect, LanguageSelect } from './LanguagePicker'

type Props = {
  dir: string
  busy: boolean
  onCancel: () => void
  onSubmit: (input: CreateProjectInput) => void
}

/** 새 프로젝트의 project.json 초기값을 입력받는다. */
export function NewProjectDialog({ dir, busy, onCancel, onSubmit }: Props): React.JSX.Element {
  const t = useT()
  const [name, setName] = useState('')
  const [sourceLanguage, setSourceLanguage] = useState('ko')
  const [targetLanguages, setTargetLanguages] = useState<string[]>(['en', 'ja'])

  const trimmedName = name.trim()
  const valid = trimmedName.length > 0 && sourceLanguage !== ''

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{t.newProject.title}</h3>
        <p className="project-path">{dir}</p>

        <div className="field">
          <label htmlFor="project-name">{t.newProject.name}</label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.newProject.namePlaceholder}
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="source-language">{t.newProject.sourceLanguage}</label>
          <LanguageSelect id="source-language" value={sourceLanguage} exclude={targetLanguages} onChange={setSourceLanguage} />
        </div>

        <div className="field">
          <label htmlFor="target-languages">{t.newProject.targetLanguages}</label>
          <LanguageMultiSelect
            id="target-languages"
            values={targetLanguages}
            exclude={[sourceLanguage]}
            onChange={setTargetLanguages}
          />
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!valid || busy}
            onClick={() =>
              onSubmit({ dir, name: trimmedName, sourceLanguage, targetLanguages })
            }
          >
            {t.newProject.create}
          </button>
        </div>
      </div>
    </div>
  )
}
