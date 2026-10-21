import { parseSmart, type SmartSyntax } from './smart'
import { scanTags } from './tags'

export type HighlightSegment = { kind: 'text' | 'var' | 'tag'; text: string }

/**
 * 그리드에서 변수와 태그를 색으로 구분하려고 글을 구간으로 나눈다. 원문 글자는 그대로 둔다(이스케이프를 풀지 않는다).
 * 포매터가 붙은 플레이스홀더는 안쪽까지 통째로 변수 한 구간이다.
 */
export function highlightSegments(text: string, syntax: SmartSyntax): HighlightSegment[] {
  const spans: { start: number; end: number; kind: 'var' | 'tag' }[] = []
  for (const token of parseSmart(text, syntax).tokens) {
    if (token.kind === 'placeholder') spans.push({ start: token.start, end: token.end, kind: 'var' })
  }
  // 변수 안에 든 태그는 변수 구간이 이미 덮는다
  for (const tag of scanTags(text)) {
    if (!spans.some((span) => tag.start < span.end && tag.end > span.start)) {
      spans.push({ start: tag.start, end: tag.end, kind: 'tag' })
    }
  }
  spans.sort((a, b) => a.start - b.start)

  const segments: HighlightSegment[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, span.start) })
    segments.push({ kind: span.kind, text: text.slice(span.start, span.end) })
    cursor = span.end
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) })
  return segments
}
