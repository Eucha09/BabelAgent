import { useCallback, useEffect, useRef, useState } from 'react'
import type { Messages } from '@shared/i18n'
import type { ClaudeCliStatus, ClaudeUpdateResult } from '@shared/schema/cli'
import type { IpcError } from '@shared/types'
import { useT } from '../i18n'

const api = window.babel

/** 결과를 보여 주고 창을 닫기까지 기다리는 시간 */
const DONE_DELAY_MS = 1200

type Phase =
  | { kind: 'checking' }
  | { kind: 'missing'; status: ClaudeCliStatus }
  /** 실행 파일은 있는데 응답하지 않았다(처음 실행·백신 검사 등). 설치를 권하지 않고 다시 시도를 권한다 */
  | { kind: 'unresponsive'; status: ClaudeCliStatus }
  | { kind: 'installing' }
  | { kind: 'updating'; status: ClaudeCliStatus }
  | { kind: 'failed'; status: ClaudeCliStatus | null; error: IpcError | null; result: ClaudeUpdateResult | null }
  /** 문구는 그릴 때 만든다 — 확인 중에 화면 언어가 바뀌어도 맞는 언어로 보이게 */
  | { kind: 'done'; status: ClaudeCliStatus; result: ClaudeUpdateResult }

type Props = {
  /** 창을 닫을 때. status 는 마지막으로 읽은 Claude Code 상태, message 는 상태바에 남길 한 줄 */
  onFinished: (status: ClaudeCliStatus | null, message: string | null) => void
}

function requiredWarning(status: ClaudeCliStatus, t: Messages): string | null {
  if (status.meetsRequired !== false || status.requiredVersion === null) return null
  return t.claudeGate.requiredWarning(status.requiredVersion)
}

function doneMessage(result: ClaudeUpdateResult, t: Messages): string {
  const version = result.after ?? result.before ?? ''
  if (result.outcome === 'updated') return t.claudeGate.updated(result.before ?? '?', version)
  if (result.outcome === 'skipped') return t.claudeGate.skippedDev(version)
  return t.claudeGate.upToDate(version)
}

/**
 * 앱을 켤 때 Claude Code 를 확인하는 창. 설치돼 있으면 업데이트를 확인하고, 끝날 때까지 앱을 쓰지 못하게 가린다.
 * 없으면 공식 설치 스크립트를 보이는 창에서 돌리는 [설치]를 권한다. 실패해도 갇히지 않게 [지금 버전으로 계속]·[나중에]를 둔다.
 */
export function ClaudeGate({ onFinished }: Props): React.JSX.Element {
  const t = useT()
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  const finished = useRef(false)
  /** 확인 차례 번호. 새 확인이 시작되면 앞선 확인의 결과는 버린다 */
  const runId = useRef(0)
  /** 개발 모드(StrictMode)는 마운트 효과를 두 번 돌린다. 확인과 업데이트가 겹치지 않게 한 번만 시작한다 */
  const started = useRef(false)

  const finish = useCallback(
    (status: ClaudeCliStatus | null, message: string | null) => {
      if (finished.current) return
      finished.current = true
      onFinished(status, message)
    },
    [onFinished]
  )

  const check = useCallback(async () => {
    const id = ++runId.current
    const stale = (): boolean => id !== runId.current
    setPhase({ kind: 'checking' })
    const status = await api.cli.status()
    if (stale()) return
    if (!status.ok) {
      setPhase({ kind: 'failed', status: null, error: status.error, result: null })
      return
    }
    if (status.value.executable && status.value.version === null && status.value.runError !== null) {
      setPhase({ kind: 'unresponsive', status: status.value })
      return
    }
    if (!status.value.executable || status.value.version === null) {
      setPhase({ kind: 'missing', status: status.value })
      return
    }
    setPhase({ kind: 'updating', status: status.value })
    const updated = await api.cli.update()
    if (stale()) return
    if (!updated.ok) {
      setPhase({ kind: 'failed', status: status.value, error: updated.error, result: null })
      return
    }
    if (updated.value.outcome === 'failed') {
      setPhase({ kind: 'failed', status: updated.value.status, error: null, result: updated.value })
      return
    }
    setPhase({ kind: 'done', status: updated.value.status, result: updated.value })
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void check()
  }, [check])

  // 설치 창이 닫히면 처음부터 다시 확인한다
  useEffect(() => api.cli.onInstallDone(() => void check()), [check])

  // 결과를 잠깐 보여 주고 닫는다. 요구 버전보다 낮으면 사용자가 읽고 닫게 둔다
  useEffect(() => {
    if (phase.kind !== 'done' || requiredWarning(phase.status, t) !== null) return
    const timer = window.setTimeout(() => finish(phase.status, doneMessage(phase.result, t)), DONE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [phase, finish, t])

  const install = async (): Promise<void> => {
    const started = await api.cli.install()
    if (!started.ok) {
      setPhase({ kind: 'failed', status: null, error: started.error, result: null })
      return
    }
    setPhase({ kind: 'installing' })
  }

  const warning = phase.kind === 'done' ? requiredWarning(phase.status, t) : null

  return (
    <div className="modal-backdrop">
      <div className="modal gate" role="dialog" aria-modal="true" aria-label={t.claudeGate.ariaLabel}>
        {phase.kind === 'checking' ? (
          <>
            <h3>{t.claudeGate.checking}</h3>
            <div className="gate-progress" />
          </>
        ) : null}

        {phase.kind === 'updating' ? (
          <>
            <h3>{t.claudeGate.updating}</h3>
            <p className="hint">{t.claudeGate.currentVersion(phase.status.version ?? '')}</p>
            <div className="gate-progress" />
          </>
        ) : null}

        {phase.kind === 'missing' ? (
          <>
            <h3>{t.claudeGate.needed}</h3>
            {phase.status.executable?.source === 'setting' ? (
              <p>
                {t.claudeGate.settingFailedBefore}
                <code>{phase.status.executable.path}</code>
                {t.claudeGate.settingFailedAfter}
              </p>
            ) : (
              <p>{t.claudeGate.notFound}</p>
            )}
            {phase.status.canInstall ? (
              <p className="hint">
                {t.claudeGate.installHint}
                <code>irm https://claude.ai/install.ps1 | iex</code>
              </p>
            ) : (
              <p className="hint">
                {t.claudeGate.manualInstallBefore}
                <code>curl -fsSL https://claude.ai/install.sh | bash</code>
                {t.claudeGate.manualInstallAfter}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => finish(phase.status, t.claudeGate.openedWithout)}>
                {t.claudeGate.later}
              </button>
              {phase.status.canInstall ? (
                <button type="button" className="primary" onClick={() => void install()}>
                  {t.claudeGate.install}
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {phase.kind === 'unresponsive' ? (
          <>
            <h3>{t.claudeGate.cannotRun}</h3>
            <p>
              <code>{phase.status.executable?.path}</code>
              {t.claudeGate.notResponding}
            </p>
            {phase.status.runError ? <pre className="login-log">{phase.status.runError}</pre> : null}
            <div className="modal-actions">
              <button type="button" onClick={() => finish(phase.status, t.claudeGate.openedUnchecked)}>
                {t.claudeGate.later}
              </button>
              <button type="button" className="primary" onClick={() => void check()}>
                {t.claudeGate.retry}
              </button>
            </div>
          </>
        ) : null}

        {phase.kind === 'installing' ? (
          <>
            <h3>{t.claudeGate.installing}</h3>
            <p className="hint">{t.claudeGate.installingHint}</p>
            <div className="gate-progress" />
            <div className="modal-actions">
              <button type="button" onClick={() => void api.cli.cancelInstall()}>
                {t.claudeGate.closeInstall}
              </button>
            </div>
          </>
        ) : null}

        {phase.kind === 'failed' ? (
          <>
            <h3>{t.claudeGate.checkFailed}</h3>
            <p>{phase.error?.message ?? t.claudeGate.updateUnfinished}</p>
            {phase.result?.detail || phase.error?.detail ? <pre className="login-log">{phase.result?.detail ?? phase.error?.detail}</pre> : null}
            {phase.status?.version ? <p className="hint">{t.claudeGate.canContinue(phase.status.version)}</p> : null}
            <div className="modal-actions">
              <button type="button" onClick={() => finish(phase.status, t.claudeGate.skippedUpdate)}>
                {phase.status?.version ? t.claudeGate.continueCurrent : t.claudeGate.later}
              </button>
              <button type="button" className="primary" onClick={() => void check()}>
                {t.claudeGate.retry}
              </button>
            </div>
          </>
        ) : null}

        {phase.kind === 'done' ? (
          <>
            <h3>{doneMessage(phase.result, t)}</h3>
            {warning ? (
              <>
                <p className="field-error">{warning}</p>
                <div className="modal-actions">
                  <button type="button" className="primary" onClick={() => finish(phase.status, doneMessage(phase.result, t))}>
                    {t.claudeGate.continue}
                  </button>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
