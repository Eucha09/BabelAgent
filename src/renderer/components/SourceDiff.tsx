import { useMemo } from 'react'
import { diffWords } from '@core/diff'

type Props = {
  /** 번역할 때 본 원문. 비어 있으면 기록이 없는 것이다. */
  before: string
  after: string
}

/** stale 행의 이전 원문과 지금 원문. 지운 부분과 새로 들어온 부분을 각 줄에 표시한다. */
export function SourceDiff({ before, after }: Props): React.JSX.Element {
  const parts = useMemo(() => diffWords(before, after), [before, after])

  if (before === '') {
    return (
      <p className="hint">
        이전 원문 기록이 없습니다. 이전 원문은 번역을 기록할 때 함께 남기는데, 이 기능이 생기기 전에 번역한
        행이거나 번역 파일을 앱 밖에서 고친 경우입니다.
      </p>
    )
  }

  return (
    <div className="source-diff">
      <div className="source-diff-line">
        <span className="source-diff-label">이전</span>
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
        <span className="source-diff-label">현재</span>
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
