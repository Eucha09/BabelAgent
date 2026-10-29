import { useState } from 'react'
import type { ColumnMapping, ImportPreview } from '@shared/schema/strings'

type Props = {
  preview: ImportPreview
  busy: boolean
  onCancel: () => void
  onConfirm: (mapping: ColumnMapping) => void
}

const FIELDS: { field: keyof ColumnMapping; label: string; required: boolean }[] = [
  { field: 'key', label: '키', required: true },
  { field: 'source', label: '원문', required: true },
  { field: 'context', label: '컨텍스트', required: false },
  { field: 'ui_type', label: 'UI 유형', required: false },
  { field: 'max_len', label: '최대 길이', required: false },
  { field: 'vars', label: '변수', required: false },
  { field: 'smart', label: 'Smart', required: false },
  { field: 'tags', label: '태그', required: false }
]

/** 외부 CSV의 열을 strings_master 열에 연결한다. 키와 원문은 반드시 골라야 한다. */
export function ImportDialog({ preview, busy, onCancel, onConfirm }: Props): React.JSX.Element {
  const [mapping, setMapping] = useState<ColumnMapping>(preview.guess)
  const valid = mapping.key !== '' && mapping.source !== ''

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <h3>원문 가져오기</h3>
        <p className="project-path">{preview.filePath}</p>
        {preview.encoding === 'cp949' ? (
          <div className="message">이 파일은 CP949로 읽었습니다. 저장은 UTF-8로 합니다.</div>
        ) : null}

        <div className="mapping">
          {FIELDS.map(({ field, label, required }) => (
            <label key={field} className="mapping-row">
              <span className="mapping-label">
                {label}
                {required ? ' *' : ''}
              </span>
              <select
                value={mapping[field]}
                onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}
              >
                <option value="">(사용 안 함)</option>
                {preview.header.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <p className="hint">
          매핑하지 않은 열은 기존 값을 그대로 둡니다. 이번 파일에 없는 키는 지우지 않고 목록으로만
          알려 드립니다.
        </p>

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
            취소
          </button>
          <button
            type="button"
            className="primary"
            disabled={!valid || busy}
            onClick={() => onConfirm(mapping)}
          >
            가져오기
          </button>
        </div>
      </div>
    </div>
  )
}
