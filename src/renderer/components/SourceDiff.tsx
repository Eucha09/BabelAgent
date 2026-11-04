import { useMemo } from 'react'
import { diffWords } from '@core/diff'
import { useT } from '../i18n'

type Props = {
  /** 번역할 때 본 원문. 비어 있으면 기록이 없는 것이다. */
  before: string
  after: string
}

/** stale 행의 이전 원문과 지금 원문. 지운 부분과 새로 들어온 부분을 각 줄에 표시한다. */
export function SourceDiff({ before, after }: Props): React.JSX.Element {
  const t = useT()
  const parts = useMemo(() => diffWords(before, after), [before, after])

  if (before === '') {
    return <p className="hint">{t.sourceDiff.noPrevious}</p>
  }

  return (
    <div className="source-diff">
      <div className="source-diff-line">
        <span className="source-diff-label">{t.sourceDiff.before}</span>
        <span className="source-diff-text">
          {parts.map((part, index) =>
            part.kind === 'add' ? null : (
              <span key={index} className={part.kind === 'remove' ? 'diff-remove' : undefined}>
                {part.text}
              </span>
            )
          )}
        </span>
      </div>
      <div className="source-diff-line">
        <span className="source-diff-label">{t.sourceDiff.after}</span>
        <span className="source-diff-text">
          {parts.map((part, index) =>
            part.kind === 'remove' ? null : (
              <span key={index} className={part.kind === 'add' ? 'diff-add' : undefined}>
                {part.text}
              </span>
            )
          )}
        </span>
      </div>
    </div>
  )
}
