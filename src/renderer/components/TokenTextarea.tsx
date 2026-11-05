import { useLayoutEffect, useRef, useState } from 'react'
import type { SmartSyntax } from '@core/qa/smart'
import { TokenText } from './TokenText'

type Props = {
  value: string
  syntax: SmartSyntax
  onChange: (value: string) => void
}

/**
 * 변수·태그를 색으로 구분해 보여 주다가, 포커스를 받으면 textarea 로 바뀌어 편집하는 칸.
 * textarea 안에서는 글자마다 색을 줄 수 없어서 편집하지 않을 때만 강조한다(검토 화면 번역 칸과 같은 방식).
 * 클릭하면 누른 자리에 커서를 두고, Tab 으로 들어오면 끝에 둔다.
 */
export function TokenTextarea({ value, syntax, onChange }: Props): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  /** 표시 칸을 누른 자리의 글자 위치. 편집 칸으로 바뀔 때 한 번 쓰고 비운다. */
  const caretRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (!editing) return
    const element = textareaRef.current
    if (!element) return
    element.focus()
    const end = element.value.length
    const at = Math.min(caretRef.current ?? end, end)
    caretRef.current = null
    element.setSelectionRange(at, at)
  }, [editing])

  if (editing) {
    return (
      // input 은 값에서 줄바꿈을 지워 버린다. 원문에 줄바꿈이 있을 수 있어 textarea 를 쓴다.
      // 높이는 CSS(field-sizing: content)가 내용에 맞춘다.
      <textarea
        ref={textareaRef}
        rows={1}
        className="grid-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setEditing(false)}
      />
    )
  }

  return (
    <div
      className="grid-input token-display"
      tabIndex={0}
      onMouseDown={(event) => {
        caretRef.current = offsetAtPoint(event.currentTarget, event.clientX, event.clientY)
      }}
      onFocus={() => setEditing(true)}
    >
      <TokenText text={value} syntax={syntax} />
    </div>
  )
}

/**
 * 화면 좌표가 가리키는 글자 위치를 root 의 글자 전체 기준으로 센다.
 * TokenText 는 글자를 바꾸지 않고 span 으로 나누기만 하므로 텍스트 노드 길이를 더하면 원문 위치가 된다.
 * 글자가 아닌 곳(여백)을 누르면 null — 커서를 끝에 둔다.
 */
function offsetAtPoint(root: HTMLElement, x: number, y: number): number | null {
  const position = document.caretPositionFromPoint(x, y)
  if (!position || position.offsetNode.nodeType !== Node.TEXT_NODE || !root.contains(position.offsetNode)) return null
  let offset = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node === position.offsetNode) return offset + position.offset
    offset += node.textContent?.length ?? 0
  }
  return null
}
