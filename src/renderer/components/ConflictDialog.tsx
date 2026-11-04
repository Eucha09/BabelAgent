import { useT } from '../i18n'

type Props = {
  message: string
  detail?: string | undefined
  busy: boolean
  onKeepMine: () => void
  onReload: () => void
  onCancel: () => void
}

/** 디스크 내용이 앱이 읽은 뒤 바뀌었을 때. 조용히 덮어쓰지 않는다. */
export function ConflictDialog({
  message,
  detail,
  busy,
  onKeepMine,
  onReload,
  onCancel
}: Props): React.JSX.Element {
  const t = useT()
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{t.conflict.title}</h3>
        <p className="screen-desc">{message}</p>
        {detail ? <pre className="login-log">{detail}</pre> : null}
        <p className="hint">{t.conflict.hint}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            {t.common.cancel}
          </button>
          <button type="button" onClick={onReload} disabled={busy}>
            {t.conflict.reload}
          </button>
          <button type="button" className="primary" onClick={onKeepMine} disabled={busy}>
            {t.conflict.overwrite}
          </button>
        </div>
      </div>
    </div>
  )
}
