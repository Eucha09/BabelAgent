import { useEffect, useRef, useState } from 'react'
import type { JobLogEntry } from '@shared/schema/jobs'
import { JobLog } from './JobLog'

export type ChatTurn = {
  id: string
  role: 'user' | 'agent' | 'error' | 'tool'
  text: string
  /** 도구 줄일 때 성공 여부 */
  ok?: boolean
  /** 오류 진단 상세. 접어서 보여준다. */
  detail?: string
}

type Props = {
  /** 배치 번역 작업 로그. 번역 화면을 보지 않아도 진행을 따라갈 수 있게 패널에도 둔다. */
  jobLog: readonly JobLogEntry[]
  jobRunning: boolean
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
  jobLog,
  jobRunning,
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
  const [logOpen, setLogOpen] = useState(false)

  // 작업이 시작되면 로그를 펼친다. 접는 것은 사용자에게 맡긴다.
  useEffect(() => {
    if (jobRunning) setLogOpen(true)
  }, [jobRunning])
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

      {jobLog.length > 0 ? (
        <div className={logOpen ? 'panel-joblog open' : 'panel-joblog'}>
          <button type="button" className="ghost panel-joblog-toggle" onClick={() => setLogOpen((value) => !value)}>
            {logOpen ? '▾' : '▸'} 작업 로그 {jobRunning ? '· 진행 중' : ''}
            <span className="hint">{jobLog.length}</span>
          </button>
          {logOpen ? <JobLog entries={jobLog} limit={80} /> : null}
        </div>
      ) : null}

      <div className="chat-log" ref={logRef}>
        {turns.length === 0 ? (
          <p className="hint">
            {projectOpen
              ? '테스트 메시지를 보내 로그인된 계정으로 응답이 오는지 확인하세요.'
              : '프로젝트를 열면 에이전트를 사용할 수 있습니다.'}
          </p>
        ) : null}
        {turns.map((turn) =>
          turn.role === 'tool' ? (
            <div key={turn.id} className={turn.ok === false ? 'chat-tool failed' : 'chat-tool'}>
              <span className="chat-tool-label">도구</span>
              <span className="mono">{turn.text}</span>
            </div>
          ) : (
            <div key={turn.id} className={`chat-turn ${turn.role}`}>
              {turn.text}
              {turn.detail ? <pre>{turn.detail}</pre> : null}
            </div>
          )
        )}
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
