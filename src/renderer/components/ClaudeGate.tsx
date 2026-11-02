import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClaudeCliStatus, ClaudeUpdateResult } from '@shared/schema/cli'
import type { IpcError } from '@shared/types'

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
  | { kind: 'done'; status: ClaudeCliStatus; message: string; warning: string | null }

type Props = {
  /** 창을 닫을 때. status 는 마지막으로 읽은 Claude Code 상태, message 는 상태바에 남길 한 줄 */
  onFinished: (status: ClaudeCliStatus | null, message: string | null) => void
}

function requiredWarning(status: ClaudeCliStatus): string | null {
  if (status.meetsRequired !== false || status.requiredVersion === null) return null
  return `최소 버전 ${status.requiredVersion} 보다 낮아 일부 기능이 동작하지 않을 수 있습니다.`
}

function doneMessage(result: ClaudeUpdateResult): string {
  const version = result.after ?? result.before ?? ''
  if (result.outcome === 'updated') return `Claude Code 를 ${result.before ?? '?'} → ${version} 으로 업데이트했습니다.`
  if (result.outcome === 'skipped') return `개발용 Claude Code(${version})를 씁니다. 업데이트하지 않습니다.`
  return `Claude Code 가 최신입니다 (${version}).`
}

/**
 * 앱을 켤 때 Claude Code 를 확인하는 창. 설치돼 있으면 업데이트를 확인하고, 끝날 때까지 앱을 쓰지 못하게 가린다.
 * 없으면 공식 설치 스크립트를 보이는 창에서 돌리는 [설치]를 권한다. 실패해도 갇히지 않게 [지금 버전으로 계속]·[나중에]를 둔다.
 */
export function ClaudeGate({ onFinished }: Props): React.JSX.Element {
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
    setPhase({
      kind: 'done',
      status: updated.value.status,
      message: doneMessage(updated.value),
      warning: requiredWarning(updated.value.status)
    })
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
    if (phase.kind !== 'done' || phase.warning !== null) return
    const timer = window.setTimeout(() => finish(phase.status, phase.message), DONE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [phase, finish])

  const install = async (): Promise<void> => {
    const started = await api.cli.install()
    if (!started.ok) {
      setPhase({ kind: 'failed', status: null, error: started.error, result: null })
      return
    }
    setPhase({ kind: 'installing' })
  }

  return (
    <div className="modal-backdrop">
      <div className="modal gate" role="dialog" aria-modal="true" aria-label="Claude Code 확인">
        {phase.kind === 'checking' ? (
          <>
            <h3>Claude Code 확인 중…</h3>
            <div className="gate-progress" />
          </>
        ) : null}

        {phase.kind === 'updating' ? (
          <>
            <h3>Claude Code 업데이트 확인 중…</h3>
            <p className="hint">지금 버전 {phase.status.version}</p>
            <div className="gate-progress" />
          </>
        ) : null}

        {phase.kind === 'missing' ? (
          <>
            <h3>Claude Code 가 필요합니다</h3>
            {phase.status.executable?.source === 'setting' ? (
              <p>
                설정한 경로의 Claude Code 를 실행하지 못했습니다: <code>{phase.status.executable.path}</code>. 설정 화면에서
                경로를 비우면 자동으로 찾습니다.
              </p>
            ) : (
              <p>이 PC 에서 Claude Code 를 찾지 못했습니다.</p>
            )}
            {phase.status.canInstall ? (
              <p className="hint">
                [설치]를 누르면 새 창에서 공식 설치 스크립트를 실행합니다: <code>irm https://claude.ai/install.ps1 | iex</code>
              </p>
            ) : (
              <p className="hint">
                터미널에서 <code>curl -fsSL https://claude.ai/install.sh | bash</code> 를 실행해 설치한 뒤 앱을 다시 여세요.
              </p>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => finish(phase.status, 'Claude Code 없이 열었습니다. 에이전트 기능은 쓸 수 없습니다.')}>
                나중에
              </button>
              {phase.status.canInstall ? (
                <button type="button" className="primary" onClick={() => void install()}>
                  설치
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {phase.kind === 'unresponsive' ? (
          <>
            <h3>Claude Code 를 실행하지 못했습니다</h3>
            <p>
              <code>{phase.status.executable?.path}</code> 가 응답하지 않았습니다. 잠시 뒤 다시 시도하세요.
            </p>
            {phase.status.runError ? <pre className="login-log">{phase.status.runError}</pre> : null}
            <div className="modal-actions">
              <button type="button" onClick={() => finish(phase.status, 'Claude Code 를 확인하지 못한 채로 열었습니다.')}>
                나중에
              </button>
              <button type="button" className="primary" onClick={() => void check()}>
                다시 시도
              </button>
            </div>
          </>
        ) : null}

        {phase.kind === 'installing' ? (
          <>
            <h3>Claude Code 설치 중</h3>
            <p className="hint">설치 창에서 진행합니다. 끝나면 그 창에서 Enter 를 눌러 닫으세요.</p>
            <div className="gate-progress" />
            <div className="modal-actions">
              <button type="button" onClick={() => void api.cli.cancelInstall()}>
                설치 창 닫기
              </button>
            </div>
          </>
        ) : null}

        {phase.kind === 'failed' ? (
          <>
            <h3>Claude Code 를 확인하지 못했습니다</h3>
            <p>{phase.error?.message ?? '업데이트가 끝나지 않았습니다. 네트워크를 확인한 뒤 다시 시도하세요.'}</p>
            {phase.result?.detail || phase.error?.detail ? <pre className="login-log">{phase.result?.detail ?? phase.error?.detail}</pre> : null}
            {phase.status?.version ? <p className="hint">지금 버전 {phase.status.version} 으로 계속 쓸 수 있습니다.</p> : null}
            <div className="modal-actions">
              <button type="button" onClick={() => finish(phase.status, 'Claude Code 업데이트를 건너뛰었습니다.')}>
                {phase.status?.version ? '지금 버전으로 계속' : '나중에'}
              </button>
              <button type="button" className="primary" onClick={() => void check()}>
                다시 시도
              </button>
            </div>
          </>
        ) : null}

        {phase.kind === 'done' ? (
          <>
            <h3>{phase.message}</h3>
            {phase.warning ? (
              <>
                <p className="field-error">{phase.warning}</p>
                <div className="modal-actions">
                  <button type="button" className="primary" onClick={() => finish(phase.status, phase.message)}>
                    계속
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
