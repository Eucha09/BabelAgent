import { useEffect, useRef, useState } from 'react'
import type { JobLogEntry } from '@shared/schema/jobs'
import type { StyleRuleChange } from '@shared/schema/project'
import { useT } from '../i18n'
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


function RuleProposal({
  card,
  onSave,
  onDismiss
}: {
  card: RuleCard
  onSave: () => void
  onDismiss: () => void
}): React.JSX.Element {
  const t = useT()
  const { change } = card
  return (
    <div className={`rule-card ${card.state}`}>
      <div className="rule-card-head">
        <span>{t.agentPanel.ruleTitle[change.op]}</span>
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
              {card.state === 'failed' ? t.agentPanel.saveAgain : t.agentPanel.save}
            </button>
            <button type="button" onClick={onDismiss}>
              {t.agentPanel.dismiss}
            </button>
          </div>
          <p className="hint">{t.agentPanel.saveHint}</p>
        </>
      ) : (
        <p className="hint">
          {card.state === 'saving'
            ? t.agentPanel.saving
            : card.state === 'saved'
              ? card.ruleId
                ? t.agentPanel.savedWithId(card.ruleId)
                : t.agentPanel.saved
              : t.agentPanel.dismissed}
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
  const t = useT()
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
        <button type="button" onClick={onToggle} title={t.agentPanel.expand}>
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
        <span>{t.agentPanel.title}</span>
        <span className="row">
          <span className="badge" title={sessionId ?? t.agentPanel.noSession}>
            {sessionId ? t.agentPanel.sessionKept : t.agentPanel.newSession}
          </span>
          <button type="button" onClick={onToggle} title={t.agentPanel.collapse}>
            ▶
          </button>
        </span>
      </div>

      {jobLog.length > 0 ? (
        <div className={logOpen ? 'panel-joblog open' : 'panel-joblog'}>
          <button type="button" className="ghost panel-joblog-toggle" onClick={() => setLogOpen((value) => !value)}>
            {logOpen ? '▾' : '▸'} {t.agentPanel.jobLog} {jobRunning ? t.agentPanel.jobRunning : ''}
            <span className="hint">{jobLog.length}</span>
          </button>
          {logOpen ? <JobLog entries={jobLog} limit={80} /> : null}
        </div>
      ) : null}

      <div className="chat-log" ref={logRef}>
        {turns.length === 0 ? (
          <p className="hint">
            {projectOpen ? t.agentPanel.emptyOpen : t.agentPanel.emptyClosed}
          </p>
        ) : null}
        {turns.map((turn) =>
          turn.role === 'rule' && turn.rule ? (
            isOpen(turn.rule) ? (
              <div key={turn.id} className="chat-tool">
                <span className="chat-tool-label">{t.agentPanel.ruleLabel}</span>
                <span>{t.agentPanel.ruleSeeCard(t.agentPanel.ruleTitle[turn.rule.change.op])}</span>
              </div>
            ) : (
              <RuleProposal key={turn.id} card={turn.rule} onSave={() => onRuleSave(turn.id)} onDismiss={() => onRuleDismiss(turn.id)} />
            )
          ) : turn.role === 'tool' ? (
            <div key={turn.id} className={turn.ok === false ? 'chat-tool failed' : 'chat-tool'}>
              <span className="chat-tool-label">{t.agentPanel.toolLabel}</span>
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
          placeholder={projectOpen ? t.agentPanel.placeholder : t.agentPanel.placeholderClosed}
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
            {t.agentPanel.send}
          </button>
          <button type="button" disabled={!sending} onClick={onCancel}>
            {t.common.cancel}
          </button>
        </div>
      </div>
    </aside>
  )
}
