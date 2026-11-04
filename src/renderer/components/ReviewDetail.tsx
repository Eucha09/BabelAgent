import { useEffect, useState } from 'react'
import type { SmartSyntax } from '@core/qa/smart'
import type { TranslationStatus } from '@shared/schema/project'
import type { QaDiagnostic } from '@shared/schema/qa'
import type { RerollCandidate } from '@shared/schema/review'
import type { IpcError } from '@shared/types'
import { useT } from '../i18n'
import { statusLabel } from '../state/labels'
import type { ReviewRow } from './ReviewGrid'
import { SourceDiff } from './SourceDiff'
import { TokenText } from './TokenText'

export type ManualStatus = Extract<TranslationStatus, 'draft' | 'review' | 'approved'>

const STATUS_ACTIONS: readonly ManualStatus[] = ['draft', 'review', 'approved']

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
  const t = useT()
  if (diagnostics.length === 0) return <p className="hint">{t.reviewDetail.noDiagnostics}</p>
  return (
    <ul className="diagnostic-list">
      {diagnostics.map((item, index) => (
        <li key={`${item.ruleId}-${index}`} className={`diagnostic ${item.severity}`}>
          <span className={`qa-pill ${item.severity}`}>{item.severity === 'error' ? t.reviewDetail.error : t.reviewDetail.warning}</span>
          <span className="diagnostic-rule">{t.qaRule[item.ruleId]}</span>
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
  const t = useT()
  const [note, setNote] = useState(row.note)
  const [instruction, setInstruction] = useState('')
  const elapsed = useElapsedSeconds(rerollStartedAt)

  const empty = row.translation.trim() === ''
  const errors = row.diagnostics.filter((item) => item.severity === 'error').length
  const stale = row.status === 'stale' || row.diagnostics.some((item) => item.ruleId === 'status.stale')

  const statusTitle = (status: ManualStatus): string | undefined => {
    if (empty) return t.reviewDetail.emptyTranslation
    if (status === 'approved' && errors > 0) return t.reviewDetail.fixErrorsFirst
    if (row.status === 'stale') return t.reviewDetail.staleClears
    return undefined
  }

  return (
    <section className="review-detail">
      <header className="review-detail-head">
        <code className="token-key">{row.key}</code>
        <span className={`status-badge ${row.status}`}>{statusLabel(row.status, t)}</span>
        {row.confidence ? <span className="hint mono">{t.reviewDetail.confidence(row.confidence)}</span> : null}
        <span className="spacer" />
        <button type="button" onClick={onStartEdit} disabled={busy} title={t.reviewDetail.editHint}>
          {t.reviewDetail.edit}
        </button>
        <div className="segmented">
          {STATUS_ACTIONS.map((status) => (
            <button
              key={status}
              type="button"
              className={row.status === status ? 'selected' : undefined}
              disabled={busy || empty || row.status === status || (status === 'approved' && errors > 0)}
              title={statusTitle(status)}
              onClick={() => onSetStatus(status)}
            >
              {t.status[status]}
            </button>
          ))}
        </div>
      </header>

      <div className="review-detail-body">
        <div className="review-detail-col">
          <div className="detail-block">
            <div className="detail-label">{t.reviewDetail.source}</div>
            <TokenText className="detail-text" text={row.source} syntax={syntax} />
          </div>
          {stale ? (
            <div className="detail-block">
              <div className="detail-label">{t.reviewDetail.sourceChanged}</div>
              <SourceDiff before={row.source_snapshot} after={row.source} />
            </div>
          ) : null}
          <div className="detail-block">
            <div className="detail-label">{t.reviewDetail.translation}</div>
            {empty ? (
              <span className="hint">{t.reviewDetail.untranslated}</span>
            ) : (
              <TokenText className="detail-text" text={row.translation} syntax={syntax} />
            )}
          </div>
          <dl className="dl detail-meta">
            {row.context ? (
              <>
                <dt>{t.columns.context}</dt>
                <dd>{row.context}</dd>
              </>
            ) : null}
            {row.ui_type ? (
              <>
                <dt>{t.columns.ui_type}</dt>
                <dd>{row.ui_type}</dd>
              </>
            ) : null}
            {row.max_len ? (
              <>
                <dt>{t.columns.max_len}</dt>
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
            <div className="detail-label">{t.reviewDetail.note}</div>
            <textarea
              rows={2}
              value={note}
              disabled={busy || empty}
              placeholder={empty ? t.reviewDetail.noteNeedsTranslation : t.reviewDetail.notePlaceholder}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="row detail-actions">
              <button type="button" disabled={busy || empty || note === row.note} onClick={() => onSaveNote(note)}>
                {t.reviewDetail.saveNote}
              </button>
            </div>
          </div>

          <div className="detail-block">
            <div className="detail-label">{t.reviewDetail.reroll}</div>
            <textarea
              rows={2}
              value={instruction}
              disabled={rerollStartedAt !== null}
              placeholder={t.reviewDetail.rerollPlaceholder}
              onChange={(event) => setInstruction(event.target.value)}
            />
            <div className="row detail-actions">
              {rerollStartedAt !== null ? (
                <>
                  <span className="hint">{t.reviewDetail.rerolling(elapsed)}</span>
                  <button type="button" onClick={onCancelReroll}>
                    {t.common.cancel}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={rerollElsewhere}
                  title={rerollElsewhere ? t.reviewDetail.rerollElsewhere : t.reviewDetail.rerollHint}
                  onClick={() => onReroll(instruction)}
                >
                  {t.reviewDetail.reroll}
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
                  <span className="detail-label">{t.reviewDetail.candidate}</span>
                  <span className="hint mono">{t.reviewDetail.confidence(candidate.confidence.toFixed(2))}</span>
                  {candidate.instruction ? <span className="hint">{t.reviewDetail.instruction(candidate.instruction)}</span> : null}
                </div>
                <TokenText className="detail-text" text={candidate.text} syntax={syntax} />
                {candidate.note ? <p className="hint">{t.reviewDetail.candidateNote(candidate.note)}</p> : null}
                {candidate.diagnostics.length > 0 ? <DiagnosticList diagnostics={candidate.diagnostics} /> : null}
                <div className="row detail-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || candidate.text === row.translation}
                    title={candidateErrors > 0 ? t.reviewDetail.candidateHasErrors : t.reviewDetail.candidateApplyHint}
                    onClick={() => onApplyCandidate(candidate)}
                  >
                    {t.reviewDetail.apply}
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDiscardCandidate(candidate)}>
                    {t.reviewDetail.discard}
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
