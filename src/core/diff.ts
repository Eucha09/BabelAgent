/** 이전 원문과 새 원문의 차이. stale 행을 검토할 때 무엇이 바뀌었는지 보여 준다. */

export type DiffPart = { kind: 'same' | 'add' | 'remove'; text: string }

/** 이보다 크면 LCS 표가 커져서 통째로 바뀐 것으로 보여 준다. 원문 한 줄에서는 거의 닿지 않는다. */
const MAX_CELLS = 400_000

const words = new Intl.Segmenter(undefined, { granularity: 'word' })

/** 단어·공백·문장부호를 각각 한 조각으로 나눈다. 띄어 쓰지 않는 언어도 ICU 단어 분리를 따른다. */
export function tokenizeWords(text: string): string[] {
  return Array.from(words.segment(text), (segment) => segment.segment)
}

function push(parts: DiffPart[], kind: DiffPart['kind'], text: string): void {
  const last = parts[parts.length - 1]
  if (last && last.kind === kind) last.text += text
  else parts.push({ kind, text })
}

/** 단어 단위 차이. 같은 종류가 이어지면 한 조각으로 합친다. */
export function diffWords(before: string, after: string): DiffPart[] {
  if (before === after) return before === '' ? [] : [{ kind: 'same', text: before }]
  const a = tokenizeWords(before)
  const b = tokenizeWords(after)

  // 앞뒤 공통 부분은 표 밖에서 처리해 크기를 줄인다
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1

  const parts: DiffPart[] = []
  if (head > 0) push(parts, 'same', a.slice(0, head).join(''))

  const midA = a.slice(head, a.length - tail)
  const midB = b.slice(head, b.length - tail)
  const n = midA.length
  const m = midB.length

  if (n * m > MAX_CELLS) {
    if (n > 0) push(parts, 'remove', midA.join(''))
    if (m > 0) push(parts, 'add', midB.join(''))
  } else {
    // lcs[i][j] = midA[i..] 와 midB[j..] 의 최장 공통 부분열 길이
    const width = m + 1
    const lcs = new Uint32Array((n + 1) * width)
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        lcs[i * width + j] =
          midA[i] === midB[j]
            ? (lcs[(i + 1) * width + j + 1] ?? 0) + 1
            : Math.max(lcs[(i + 1) * width + j] ?? 0, lcs[i * width + j + 1] ?? 0)
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      const tokenA = midA[i] ?? ''
      const tokenB = midB[j] ?? ''
      if (tokenA === tokenB) {
        push(parts, 'same', tokenA)
        i += 1
        j += 1
      } else if ((lcs[(i + 1) * width + j] ?? 0) >= (lcs[i * width + j + 1] ?? 0)) {
        push(parts, 'remove', tokenA)
        i += 1
      } else {
        push(parts, 'add', tokenB)
        j += 1
      }
    }
    while (i < n) push(parts, 'remove', midA[i++] ?? '')
    while (j < m) push(parts, 'add', midB[j++] ?? '')
  }

  if (tail > 0) push(parts, 'same', a.slice(a.length - tail).join(''))
  return parts
}
