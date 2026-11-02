import { useEffect, useState } from 'react'
import type { SmartSyntax } from '@core/qa/smart'
import type { TranslationStatus } from '@shared/schema/project'
import type { QaDiagnostic } from '@shared/schema/qa'
import type { RerollCandidate } from '@shared/schema/review'
import type { IpcError } from '@shared/types'
import { RULE_LABEL } from '../state/review'
import type { ReviewRow } from './ReviewGrid'
import { SourceDiff } from './SourceDiff'
import { STATUS_LABEL } from './StringsGrid'
import { TokenText } from './TokenText'

export type ManualStatus = Extract<TranslationStatus, 'draft' | 'review' | 'approved'>

const STATUS_ACTIONS: { status: ManualStatus; label: string }[] = [
  { status: 'draft', label: '초안' },
  { status: 'review', label: '검토' },
  { status: 'approved', label: '승인' }
]

type Props = {
  row: ReviewRow
  syntax: SmartSyntax
  /** 저장 중이거나 편집을 막아야 할 때 */
  busy: boolean
  candidates: readonly RerollCandidate[]
  /** 이 행을 재번역하는 중이면 시작 시각 */
  rerollStartedAt: number | null
  /** 다른 행을 재번역하는 중 */
  rerollElsewhere: boolean
  rerollError: IpcError | null
  onStartEdit: () => void
  onSetStatus: (status: ManualStatus) => void
  onSaveNote: (note: string) => void
  onReroll: (instruction: string) => void
  onCancelReroll: () => void
  onApplyCandidate: (candidate: RerollCandidate) => void
  onDiscardCandidate: (candidate: RerollCandidate) => void
}

function DiagnosticList({ diagnostics }: { diagnostics: readonly QaDiagnostic[] }): React.JSX.Element {
  if (diagnostics.length === 0) return <p className="hint">QA 진단 없음</p>
  return (
    <ul className="diagnostic-list">
      {diagnostics.map((item, index) => (
        <li key={`${item.ruleId}-${index}`} className={`diagnostic ${item.severity}`}>
          <span className={`qa-pill ${item.severity}`}>{item.severity === 'error' ? '오류' : '경고'}</span>
          <span className="diagnostic-rule">{RULE_LABEL[item.ruleId]}</span>
          <span className="diagnostic-message">{item.message}</span>
          {item.detail ? <span className="diagnostic-detail">{item.detail}</span> : null}
        </li>
      ))}
    </ul>
  )
}

function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000))
}

/** 선택한 행의 원문·번역·진단과 상태 전환, 메모, 재번역 후보. 부모가 행마다 key 를 바꿔 입력 상태를 비운다. */
export function ReviewDetail({
  row,
  syntax,
  busy,
  candidates,
  rerollStartedAt,
  rerollElsewhere,
  rerollError,
  onStartEdit,
  onSetStatus,
  onSaveNote,
  onReroll,
  onCancelReroll,
  onApplyCandidate,
  onDiscardCandidate
}: Props): React.JSX.Element {
  const [note, setNote] = useState(row.note)
  const [instruction, setInstruction] = useState('')
  const elapsed = useElapsedSeconds(rerollStartedAt)

  const empty = row.translation.trim() === ''
  const errors = row.diagnostics.filter((item) => item.severity === 'error').length
  const stale = row.status === 'stale' || row.diagnostics.some((item) => item.ruleId === 'status.stale')

  const statusTitle = (status: ManualStatus): string | undefined => {
    if (empty) return '번역문이 없습니다'
    if (status === 'approved' && errors > 0) return 'QA 오류를 고친 뒤 승인할 수 있습니다'
    if (row.status === 'stale') return '지금 원문을 보고 판단했다는 뜻으로 원문변경 표시가 풀립니다'
    return undefined
  }

  return (
    <section className="review-detail">
      <header className="review-detail-head">
        <code className="token-key">{row.key}</code>
        <span className={`status-badge ${row.status}`}>{STATUS_LABEL[row.status] ?? row.status}</span>
        {row.confidence ? <span className="hint mono">신뢰도 {row.confidence}</span> : null}
        <span className="spacer" />
        <button type="button" onClick={onStartEdit} disabled={busy} title="Enter 또는 더블클릭으로도 편집합니다">
          번역 편집
        </button>
        <div className="segmented">
          {STATUS_ACTIONS.map((action) => (
            <button
              key={action.status}
              type="button"
              className={row.status === action.status ? 'selected' : undefined}
              disabled={busy || empty || row.status === action.status || (action.status === 'approved' && errors > 0)}
              title={statusTitle(action.status)}
              onClick={() => onSetStatus(action.status)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </header>

      <div className="review-detail-body">
        <div className="review-detail-col">
          <div className="detail-block">
            <div className="detail-label">원문</div>
            <TokenText className="detail-text" text={row.source} syntax={syntax} />
          </div>
          {stale ? (
            <div className="detail-block">
              <div className="detail-label">원문 변경</div>
              <SourceDiff before={row.source_snapshot} after={row.source} />
            </div>
          ) : null}
          <div className="detail-block">
            <div className="detail-label">번역</div>
            {empty ? <span className="hint">미번역</span> : <TokenText className="detail-text" text={row.translation} syntax={syntax} />}
          </div>
          <dl className="dl detail-meta">
            {row.context ? (
              <>
                <dt>컨텍스트</dt>
                <dd>{row.context}</dd>
              </>
            ) : null}
            {row.ui_type ? (
              <>
                <dt>UI 유형</dt>
                <dd>{row.ui_type}</dd>
              </>
            ) : null}
            {row.max_len ? (
              <>
                <dt>최대 길이</dt>
                <dd>{row.max_len}</dd>
              </>
            ) : null}
            {row.vars ? (
              <>
                <dt>vars</dt>
                <dd>{row.vars}</dd>
              </>
            ) : null}
          </dl>
          <div className="detail-block">
            <div className="detail-label">QA</div>
            <DiagnosticList diagnostics={row.diagnostics} />
          </div>
        </div>

        <div className="review-detail-col">
          <div className="detail-block">
            <div className="detail-label">메모</div>
            <textarea
              rows={2}
              value={note}
              disabled={busy || empty}
              placeholder={empty ? '번역이 있어야 메모를 남길 수 있습니다' : '검토 메모'}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="row detail-actions">
              <button type="button" disabled={busy || empty || note === row.note} onClick={() => onSaveNote(note)}>
                메모 저장
              </button>
            </div>
          </div>

          <div className="detail-block">
            <div className="detail-label">재번역</div>
            <textarea
              rows={2}
              value={instruction}
              disabled={rerollStartedAt !== null}
              placeholder="추가 지시(선택). 예: 더 짧게"
              onChange={(event) => setInstruction(event.target.value)}
            />
            <div className="row detail-actions">
              {rerollStartedAt !== null ? (
                <>
                  <span className="hint">재번역 중… {elapsed}초</span>
                  <button type="button" onClick={onCancelReroll}>
                    취소
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={rerollElsewhere}
                  title={rerollElsewhere ? '다른 행을 재번역하는 중입니다' : '일회성 세션으로 이 행만 다시 번역해 후보를 받습니다'}
                  onClick={() => onReroll(instruction)}
                >
                  재번역
                </button>
              )}
            </div>
            {rerollError ? (
              <div className="message error">
                <strong>{rerollError.message}</strong>
                {rerollError.detail ? <pre>{rerollError.detail}</pre> : null}
              </div>
            ) : null}
          </div>

          {candidates.map((candidate) => {
            const candidateErrors = candidate.diagnostics.filter((item) => item.severity === 'error').length
            return (
              <div key={candidate.requestId} className="candidate">
                <div className="candidate-head">
                  <span className="detail-label">후보</span>
                  <span className="hint mono">신뢰도 {candidate.confidence.toFixed(2)}</span>
                  {candidate.instruction ? <span className="hint">지시: {candidate.instruction}</span> : null}
                </div>
                <TokenText className="detail-text" text={candidate.text} syntax={syntax} />
                {candidate.note ? <p className="hint">메모: {candidate.note}</p> : null}
                {candidate.diagnostics.length > 0 ? <DiagnosticList diagnostics={candidate.diagnostics} /> : null}
                <div className="row detail-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || candidate.text === row.translation}
                    title={candidateErrors > 0 ? 'QA 오류가 있는 후보입니다. 적용한 뒤 고칠 수 있습니다' : '번역을 이 후보로 바꾸고 초안으로 둡니다'}
                    onClick={() => onApplyCandidate(candidate)}
                  >
                    적용
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDiscardCandidate(candidate)}>
                    버리기
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
