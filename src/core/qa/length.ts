import { parseSmart, splitBranches, type SmartSyntax, type SmartToken } from './smart'
import { stripTags } from './tags'
import { normalizeName } from './vars'

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** 그래프임 클러스터 수. 이모지와 조합 문자가 한 글자로 세어진다. */
export function countGraphemes(text: string): number {
  let count = 0
  for (const _ of graphemes.segment(text)) count += 1
  return count
}

export type LengthAssumption = {
  name: string
  /** 치환에 쓴 example. 없으면 플레이스홀더를 그대로 셌다. */
  example: string | null
}

export type DisplayLength = {
  length: number
  /** 변수를 어떻게 셌는지. 치환 후 길이는 알 수 없으므로 진단 메시지에 함께 보여 준다. */
  assumptions: LengthAssumption[]
}

/**
 * 화면에 보일 길이를 어림한다.
 * - 리치 텍스트 태그는 보이지 않으므로 뺀다
 * - 변수는 vars 의 example 로 바꿔 세고, 없으면 플레이스홀더 글자 그대로 센다
 * - 분기가 있는 포매터(`{n:plural:one|other}`)는 가장 긴 분기로 센다
 * - 이스케이프는 푼 글자로 센다(`{{` → `{`)
 */
export function measureDisplayLength(
  text: string,
  syntax: SmartSyntax,
  examples: ReadonlyMap<string, string>,
  caseSensitive: boolean
): DisplayLength {
  const assumptions = new Map<string, LengthAssumption>()

  const render = (tokens: readonly SmartToken[], current: string | null): string => {
    let out = ''
    for (const token of tokens) {
      if (token.kind === 'literal') {
        out += stripTags(token.text)
        continue
      }
      const raw = text.slice(token.start, token.end)
      if (token.selector === '') {
        // 형식 안의 {} 는 바깥 변수의 값이다
        out += current ?? raw
        continue
      }
      const example = examples.get(normalizeName(token.selector, caseSensitive)) ?? null
      const branches = token.body ? splitBranches(token.body) : []
      if (branches.length > 1) {
        let longest = ''
        for (const branch of branches) {
          const rendered = render(branch, example)
          if (countGraphemes(rendered) > countGraphemes(longest)) longest = rendered
        }
        out += longest
        continue
      }
      if (!assumptions.has(token.selector)) assumptions.set(token.selector, { name: token.selector, example })
      out += example ?? raw
    }
    return out
  }

  const rendered = render(parseSmart(text, syntax).tokens, null)
  return { length: countGraphemes(rendered), assumptions: [...assumptions.values()] }
}

/** max_len 칸. 양의 정수가 아니면 제한 없음. */
export function parseMaxLen(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number.parseInt(trimmed, 10)
  return value > 0 ? value : null
}
