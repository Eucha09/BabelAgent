import { useEffect, useRef } from 'react'
import type { JobLogEntry } from '@shared/schema/jobs'
import { useT } from '../i18n'

/** 좁은 칸에 들어가도록 HH:MM:SS 로 쓴다. 로케일 형식("22시 55분 16초")은 줄바꿈된다. */
function clock(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 배치 작업 로그. 새 줄이 오면 맨 아래로 따라간다. */
export function JobLog({ entries, limit = 200 }: { entries: readonly JobLogEntry[]; limit?: number }): React.JSX.Element {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const shown = entries.slice(-limit)

  useEffect(() => {
    const element = ref.current
    if (element) element.scrollTop = element.scrollHeight
  }, [entries])

  if (shown.length === 0) return <p className="hint">{t.job.logEmpty}</p>

  return (
    <div className="job-log" ref={ref}>
      {shown.map((entry, index) => (
        <div key={`${entry.at}-${index}`} className={`job-log-line ${entry.level}`}>
          <span className="job-log-time">{clock(entry.at)}</span>
          <span className="job-log-message">
            {entry.message}
            {entry.detail ? <span className="job-log-detail">{entry.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  )
}
