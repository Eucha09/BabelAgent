import { useEffect, useRef, useState } from 'react'
import type { JobLogEntry } from '@shared/schema/jobs'
import type { StyleRuleChange } from '@shared/schema/project'
import { JobLog } from './JobLog'

/**
 * 에이전트가 낸 스타일 규칙 제안. 사용자가 [저장]을 눌러야 project.json 에 들어간다.
 * saving → saved/failed, 또는 dismissed 로 끝난다.
 */
export type RuleCard = {
  change: StyleRuleChange
  /** 수정·삭제할 규칙의 제안 당시 글 */
  currentText: string | null
  state: 'pending' | 'saving' | 'saved' | 'dismissed' | 'failed'
  /** 저장한 규칙 id */
  ruleId?: string
  error?: string
}

export type ChatTurn = {
  id: string
  role: 'user' | 'agent' | 'error' | 'tool' | 'rule'
  text: string
  /** 도구 줄일 때 성공 여부 */
  ok?: boolean
  /** 오류 진단 상세. 접어서 보여준다. */
  detail?: string
  /** 규칙 제안 카드일 때 */
  rule?: RuleCard
}

const RULE_TITLE: Record<StyleRuleChange['op'], string> = {
  add: '스타일 규칙 추가 제안',
  update: '스타일 규칙 수정 제안',
  remove: '스타일 규칙 삭제 제안'
}

function RuleProposal({
  card,
  onSave,
  onDismiss
}: {
  card: RuleCard
  onSave: () => void
  onDismiss: () => void
}): React.JSX.Element {
  const { change } = card
  return (
    <div className={`rule-card ${card.state}`}>
      <div className="rule-card-head">
        <span>{RULE_TITLE[change.op]}</span>
        {change.op !== 'add' ? <code className="token-key">{change.id}</code> : null}
      </div>
      {change.op === 'update' && card.currentText !== null ? <p className="rule-card-before">{card.currentText}</p> : null}
      {change.op === 'remove' ? (
        <p className="rule-card-before">{card.currentText ?? ''}</p>
      ) : (
        <p className="rule-card-text">{change.text}</p>
      )}
      {card.state === 'pending' || card.state === 'failed' ? (
        <>
          {card.error ? <p className="hint field-error">{card.error}</p> : null}
          <div className="row">
            <button type="button" className="primary" onClick={onSave}>
              {card.state === 'failed' ? '다시 저장' : '저장'}
            </button>
            <button type="button" onClick={onDismiss}>
              무시
            </button>
          </div>
          <p className="hint">저장하면 project.json 의 스타일 규칙에 들어가 다음 번역 배치부터 반영됩니다.</p>
        </>
      ) : (
        <p className="hint">
          {card.state === 'saving'
            ? '저장 중…'
            : card.state === 'saved'
              ? `저장했습니다${card.ruleId ? ` (${card.ruleId})` : ''}. 프로젝트 화면에서 고치거나 지울 수 있습니다.`
              : '무시했습니다. 이 지시는 번역 배치에 반영되지 않습니다.'}
        </p>
      )}
    </div>
  )
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
  onRuleSave: (turnId: string) => void
  onRuleDismiss: (turnId: string) => void
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
  onCancel,
  onRuleSave,
  onRuleDismiss
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
  // 확인을 기다리는 규칙 카드는 입력창 위에 붙여 둔다. 에이전트 답이 이어서 흘러나와도 위로 밀려 사라지지 않게.
  const isOpen = (card: RuleCard): boolean => card.state === 'pending' || card.state === 'saving' || card.state === 'failed'
  const openRules = turns.filter((turn) => turn.rule !== undefined && isOpen(turn.rule))

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
              ? '프로젝트에 대해 묻거나, "앞으로 NPC 대사는 반말로"처럼 지속 지시를 주세요. 지속 지시는 규칙 카드에서 [저장]을 눌러야 번역 배치에 반영됩니다.'
              : '프로젝트를 열면 에이전트를 사용할 수 있습니다.'}
          </p>
        ) : null}
        {turns.map((turn) =>
          turn.role === 'rule' && turn.rule ? (
            isOpen(turn.rule) ? (
              <div key={turn.id} className="chat-tool">
                <span className="chat-tool-label">규칙</span>
                <span>{RULE_TITLE[turn.rule.change.op]} — 아래 카드에서 확인</span>
              </div>
            ) : (
              <RuleProposal key={turn.id} card={turn.rule} onSave={() => onRuleSave(turn.id)} onDismiss={() => onRuleDismiss(turn.id)} />
            )
          ) : turn.role === 'tool' ? (
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

      {openRules.length > 0 ? (
        <div className="panel-rules">
          {openRules.map((turn) =>
            turn.rule ? (
              <RuleProposal key={turn.id} card={turn.rule} onSave={() => onRuleSave(turn.id)} onDismiss={() => onRuleDismiss(turn.id)} />
            ) : null
          )}
        </div>
      ) : null}

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
