import { useEffect, useState } from 'react'
import { formatRemaining, remainingPercent, usageLabel } from '@core/usage/format'
import type { UsageLimits } from '@shared/schema/usage'
import type { IpcError } from '@shared/types'

export type UsageView = {
  limits: UsageLimits | null
  loading: boolean
  error: IpcError | null
}

/** 구독 한도 막대. 행 구성은 서버가 정하므로 받은 순서대로 그대로 그린다. */
export function UsageMeters({ usage }: { usage: UsageView }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // 남은 시간이 멈춰 보이지 않게 30초마다 다시 센다
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (usage.loading) return <p className="hint">사용량 확인 중…</p>
  if (usage.error) return <p className="hint">{usage.error.message}</p>

  const rows = usage.limits?.limits ?? []
  if (rows.length === 0) return <p className="hint">표시할 사용량 정보가 없습니다.</p>

  return (
    <div className="meters">
      {rows.map((row) => {
        const remaining = remainingPercent(row.percent)
        return (
          <div className="meter" key={`${row.group}-${row.kind}-${row.resets_at ?? ''}`}>
            <span className="meter-label">{usageLabel(row.kind, row.scope)}</span>
            <span className="meter-track">
              <span className={`meter-fill ${row.severity}`} style={{ width: `${remaining}%` }} />
            </span>
            <span className="meter-value">{remaining}% 남음</span>
            <span className="meter-reset">{formatRemaining(row.resets_at, now)}</span>
          </div>
        )
      })}
    </div>
  )
}
