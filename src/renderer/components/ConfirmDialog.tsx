import type { ReactNode } from 'react'

type Props = {
  title: string
  children: ReactNode
  confirmLabel: string
  /** 되돌리기 어려운 동작이면 확인 버튼을 경고색으로 그린다. */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 되돌리기 어려운 동작 앞의 확인. 취소에 기본 포커스를 둔다. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel
}: Props): React.JSX.Element {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{title}</h3>
        <div className="confirm-body">{children}</div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} autoFocus>
            취소
          </button>
          <button type="button" className={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
