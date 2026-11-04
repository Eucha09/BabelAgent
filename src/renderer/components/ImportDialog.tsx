import { useState } from 'react'
import type { ColumnMapping, ImportPreview } from '@shared/schema/strings'
import { useT } from '../i18n'

type Props = {
  preview: ImportPreview
  busy: boolean
  onCancel: () => void
  onConfirm: (mapping: ColumnMapping) => void
}

const FIELDS: { field: keyof ColumnMapping; required: boolean }[] = [
  { field: 'key', required: true },
  { field: 'source', required: true },
  { field: 'context', required: false },
  { field: 'ui_type', required: false },
  { field: 'max_len', required: false },
  { field: 'vars', required: false },
  { field: 'smart', required: false },
  { field: 'tags', required: false }
]

/** 외부 CSV의 열을 strings_master 열에 연결한다. 키와 원문은 반드시 골라야 한다. */
export function ImportDialog({ preview, busy, onCancel, onConfirm }: Props): React.JSX.Element {
  const t = useT()
  const [mapping, setMapping] = useState<ColumnMapping>(preview.guess)
  const valid = mapping.key !== '' && mapping.source !== ''

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <h3>{t.importDialog.title}</h3>
        <p className="project-path">{preview.filePath}</p>
        {preview.encoding === 'cp949' ? (
          <div className="message">{t.importDialog.cp949}</div>
        ) : null}

        <div className="mapping">
          {FIELDS.map(({ field, required }) => (
            <label key={field} className="mapping-row">
              <span className="mapping-label">
                {t.columns[field]}
                {required ? ' *' : ''}
              </span>
              <select
                value={mapping[field]}
                onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}
              >
                <option value="">{t.importDialog.notUsed}</option>
                {preview.header.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <p className="hint">{t.importDialog.hint}</p>

        <div className="sample">
          <table>
            <thead>
              <tr>
                {preview.header.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sample.map((row, index) => (
                <tr key={index}>
                  {preview.header.map((column, cell) => (
                    <td key={column}>{row[cell] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!valid || busy}
            onClick={() => onConfirm(mapping)}
          >
            {t.importDialog.import}
          </button>
        </div>
      </div>
    </div>
  )
}
