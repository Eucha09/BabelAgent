import { useEffect, useRef, useState } from 'react'

export type ChatTurn = {
  id: string
  role: 'user' | 'agent' | 'error'
  text: string
  /** 오류 진단 상세. 접어서 보여준다. */
  detail?: string
}

type Props = {
  collapsed: boolean
  onToggle: () => void
  turns: readonly ChatTurn[]
  sending: boolean
  projectOpen: boolean
  sessionId: string | null
  onSend: (text: string) => void
  onCancel: () => void
}

export function AgentPanel({
  collapsed,
  onToggle,
  turns,
  sending,
  projectOpen,
  sessionId,
  onSend,
  onCancel
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [turns])

  if (collapsed) {
    return (
      <aside className="agent-panel collapsed">
        <button type="button" onClick={onToggle} title="에이전트 패널 펼치기">
          ◀
        </button>
      </aside>
    )
  }

  const canSend = projectOpen && !sending && draft.trim().length > 0

  function send(): void {
    if (!canSend) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <aside className="agent-panel">
      <div className="panel-header">
        <span>에이전트</span>
        <span className="row">
          <span className="badge" title={sessionId ?? '세션 없음'}>
            {sessionId ? '세션 유지' : '새 세션'}
          </span>
          <button type="button" onClick={onToggle} title="접기">
            ▶
          </button>
        </span>
      </div>

      <div className="chat-log" ref={logRef}>
        {turns.length === 0 ? (
          <p className="hint">
            {projectOpen
              ? '테스트 메시지를 보내 로그인된 계정으로 응답이 오는지 확인하세요.'
              : '프로젝트를 열면 에이전트를 사용할 수 있습니다.'}
          </p>
        ) : null}
        {turns.map((turn) => (
          <div key={turn.id} className={`chat-turn ${turn.role}`}>
            {turn.text}
            {turn.detail ? <pre>{turn.detail}</pre> : null}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <textarea
          rows={3}
          value={draft}
          placeholder={
            projectOpen ? '메시지를 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈)' : '프로젝트를 먼저 열어주세요'
          }
          disabled={!projectOpen || sending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            // Shift+Enter는 줄바꿈
            if (event.shiftKey) return
            // 한글 등 IME 조합 중의 Enter는 조합 확정이다. 여기서 보내면 글자가 잘린다.
            if (event.nativeEvent.isComposing) return
            event.preventDefault()
            send()
          }}
        />
        <div className="row">
          <button type="button" className="primary" disabled={!canSend} onClick={send}>
            전송
          </button>
          <button type="button" disabled={!sending} onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </aside>
  )
}
