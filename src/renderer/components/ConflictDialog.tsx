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
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>파일 충돌</h3>
        <p className="screen-desc">{message}</p>
        {detail ? <pre className="login-log">{detail}</pre> : null}
        <p className="hint">덮어쓰면 앱 밖의 변경이, 다시 불러오면 내 편집이 사라집니다.</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button type="button" onClick={onReload} disabled={busy}>
            다시 불러오기
          </button>
          <button type="button" className="primary" onClick={onKeepMine} disabled={busy}>
            덮어쓰기
          </button>
        </div>
      </div>
    </div>
  )
}
