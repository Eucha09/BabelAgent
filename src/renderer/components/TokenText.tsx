import { memo, useMemo } from 'react'
import { highlightSegments } from '@core/qa/highlight'
import type { SmartSyntax } from '@core/qa/smart'

type Props = {
  text: string
  syntax: SmartSyntax
  className?: string
}

/** 변수와 리치 텍스트 태그를 색으로 구분해 보여 준다. 글자는 바꾸지 않는다. */
export const TokenText = memo(function TokenText({ text, syntax, className }: Props): React.JSX.Element {
  const segments = useMemo(() => highlightSegments(text, syntax), [text, syntax])
  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          segment.text
        ) : (
          <span key={index} className={segment.kind === 'var' ? 'token-var' : 'token-tag'}>
            {segment.text}
          </span>
        )
      )}
    </span>
  )
})
