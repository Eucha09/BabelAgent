import type { ProjectConfig } from '@shared/schema/project'

/**
 * Smart Strings 토크나이저. 범용 파서가 아니라 검증에 필요한 만큼만 나눈다.
 * 이스케이프 규칙은 Unity Localization 이 쓰는 SmartFormat 2.x 파서(Parser.ParseFormat)와 같게 맞춘다.
 * 자세한 규칙은 docs/qa-rules.md.
 */

export type SmartStringsSettings = ProjectConfig['smartStrings']

/** 토큰화에 쓰는 설정. 프로젝트마다 Unity 설정이 다르므로 코드에 박지 않는다. */
export type SmartSyntax = Pick<
  SmartStringsSettings,
  'alternativeEscaping' | 'escapeChar' | 'convertCharacterStringLiterals'
>

export type SmartLiteral = {
  kind: 'literal'
  /** 이스케이프를 푼 글자. `{{` 는 `{` 로, convertCharacterStringLiterals 면 `\n` 은 줄바꿈으로. */
  text: string
  start: number
  end: number
}

export type SmartPlaceholder = {
  kind: 'placeholder'
  /** 선택자. 정렬(`{0,10}`)은 뺀다. 빈 플레이스홀더 `{}` 는 빈 문자열. */
  selector: string
  /** 콜론 뒤가 이름 규칙에 맞을 때만 채운다. 목록에 있는지는 보지 않는다. */
  formatter?: string
  /** 포매터 이름 뒤 괄호 안. `{0:choose(1|2):a|b}` → `1|2` */
  options?: string
  /** 콜론 뒤 형식 부분. 중첩 플레이스홀더를 담는다. 콜론이 없으면 undefined. */
  body?: SmartToken[]
  /** 원문에서 `{` 부터 `}` 까지(닫히지 않았으면 끝까지) */
  start: number
  end: number
  closed: boolean
}

export type SmartToken = SmartLiteral | SmartPlaceholder

export type BraceProblem = {
  kind: 'unclosed' | 'stray-close'
  /** 문제가 된 중괄호의 위치. unclosed 는 여는 괄호 위치. */
  index: number
}

export type SmartParse = {
  tokens: SmartToken[]
  problems: BraceProblem[]
}

/** convertCharacterStringLiterals 가 켜졌을 때 리터럴로 바뀌는 문자 */
const CHAR_LITERALS: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '0': '\0',
  a: '\u0007',
  b: '\b',
  f: '\f',
  v: '\v',
  "'": "'",
  '"': '"',
  '\\': '\\'
}

const IDENTIFIER = /[A-Za-z0-9_]/
/** 선택자로 쓰이는 글자의 앞부분(이름, 인덱스, 점·대괄호 경로) */
const SELECTOR_HEAD = /^[\p{L}\p{N}_.[\]-]+/u
const HEX4 = /^[0-9a-fA-F]{4}$/

class Parser {
  private index = 0
  readonly problems: BraceProblem[] = []

  constructor(
    private readonly text: string,
    private readonly syntax: SmartSyntax
  ) {}

  /**
   * 형식 부분(최상위 또는 콜론 뒤)을 읽는다. 중첩 안에서는 닫는 `}` 를 만나면 소비하지 않고 멈춘다.
   */
  parseFormat(nested: boolean): SmartToken[] {
    const { text, syntax } = this
    const tokens: SmartToken[] = []
    let literal = ''
    let literalStart = this.index

    const flush = (): void => {
      if (literal !== '') tokens.push({ kind: 'literal', text: literal, start: literalStart, end: this.index })
      literal = ''
      literalStart = this.index
    }

    while (this.index < text.length) {
      const c = text.charAt(this.index)
      const next = text.charAt(this.index + 1)

      if (c === '{') {
        if (!syntax.alternativeEscaping && next === '{') {
          literal += '{'
          this.index += 2
          continue
        }
        flush()
        tokens.push(this.parsePlaceholder())
        literalStart = this.index
        continue
      }

      if (c === '}') {
        if (!syntax.alternativeEscaping && next === '}') {
          literal += '}'
          this.index += 2
          continue
        }
        if (nested) break
        // 짝 없는 닫는 괄호. SmartFormat 처럼 글자로 남기고 문제로 기록한다
        this.problems.push({ kind: 'stray-close', index: this.index })
        literal += '}'
        this.index += 1
        continue
      }

      const charLiteral = c === '\\' && syntax.convertCharacterStringLiterals
      const altEscape = syntax.alternativeEscaping && c === syntax.escapeChar
      if (charLiteral || altEscape) {
        if (next === '{' || next === '}') {
          literal += next
          this.index += 2
          continue
        }
        if (next === '') {
          literal += c
          this.index += 1
          continue
        }
        if (charLiteral) {
          literal += this.convertCharLiteral(next)
          continue
        }
        // 대체 이스케이프 문자 + 다른 글자는 두 글자를 그대로 둔다
        literal += c + next
        this.index += 2
        continue
      }

      literal += c
      this.index += 1
    }

    flush()
    return tokens
  }

  /** `\` 다음 글자를 문자로 바꾸고 위치를 옮긴다. 모르는 시퀀스는 그대로 둔다. */
  private convertCharLiteral(next: string): string {
    if (next === 'u') {
      const hex = this.text.slice(this.index + 2, this.index + 6)
      if (HEX4.test(hex)) {
        this.index += 6
        return String.fromCharCode(Number.parseInt(hex, 16))
      }
    }
    this.index += 2
    return CHAR_LITERALS[next] ?? `\\${next}`
  }

  private parsePlaceholder(): SmartPlaceholder {
    const { text } = this
    const start = this.index
    this.index += 1

    // 선택자: `:` 또는 `}` 까지. 선택자 안의 `{` 는 SmartFormat 에서도 특별하지 않다(잘못된 글자일 뿐).
    let selectorEnd = this.index
    while (selectorEnd < text.length && text[selectorEnd] !== ':' && text[selectorEnd] !== '}') selectorEnd += 1
    const selector = cleanSelector(text.slice(this.index, selectorEnd))
    this.index = selectorEnd

    if (this.index >= text.length) {
      this.problems.push({ kind: 'unclosed', index: start })
      // 닫히지 않으면 뒤따르는 글까지 선택자로 읽힌다("{0 gold"). 앞쪽 선택자 글자만 취해 변수 비교가 엉뚱한 이름을 내지 않게 한다.
      const leading = SELECTOR_HEAD.exec(selector)?.[0] ?? ''
      return { kind: 'placeholder', selector: leading, start, end: text.length, closed: false }
    }

    if (text[this.index] === '}') {
      this.index += 1
      return { kind: 'placeholder', selector, start, end: this.index, closed: true }
    }

    // 콜론 뒤: 포매터 이름이 있는지 본다
    this.index += 1
    const head = this.readFormatterHead()
    const body = this.parseFormat(true)

    const placeholder: SmartPlaceholder = { kind: 'placeholder', selector, body, start, end: this.index, closed: false }
    if (head.formatter !== undefined) placeholder.formatter = head.formatter
    if (head.options !== undefined) placeholder.options = head.options

    if (this.index < text.length && text[this.index] === '}') {
      this.index += 1
      placeholder.end = this.index
      placeholder.closed = true
    } else {
      this.problems.push({ kind: 'unclosed', index: start })
      placeholder.end = text.length
    }
    return placeholder
  }

  /**
   * 콜론 직후부터 `(` 또는 다음 `:` 까지가 식별자 글자로만 이뤄져 있으면 포매터 이름이다.
   * `(` 뒤의 옵션은 `)` 다음이 `:` 또는 `}` 일 때만 인정한다(SmartFormat 과 같다).
   * 규칙에 맞지 않으면 이름 생략으로 보고 위치를 옮기지 않는다.
   */
  private readFormatterHead(): { formatter?: string; options?: string } {
    const { text } = this
    let cursor = this.index
    while (cursor < text.length && IDENTIFIER.test(text.charAt(cursor))) cursor += 1
    if (cursor === this.index) return {}
    const name = text.slice(this.index, cursor)
    const stop = text.charAt(cursor)

    if (stop === ':') {
      this.index = cursor + 1
      return { formatter: name }
    }
    if (stop !== '(') return {}

    let close = cursor + 1
    while (close < text.length && !'(){}'.includes(text.charAt(close))) close += 1
    if (text.charAt(close) !== ')') return {}
    const after = text.charAt(close + 1)
    if (after !== ':' && after !== '}') return {}

    const options = text.slice(cursor + 1, close)
    this.index = after === ':' ? close + 2 : close + 1
    return { formatter: name, options }
  }
}

/** 정렬 지정(`{0,10}`)은 선택자가 아니다. */
function cleanSelector(raw: string): string {
  const comma = raw.indexOf(',')
  return (comma === -1 ? raw : raw.slice(0, comma)).trim()
}

export function parseSmart(text: string, syntax: SmartSyntax): SmartParse {
  const parser = new Parser(text, syntax)
  const tokens = parser.parseFormat(false)
  return { tokens, problems: parser.problems }
}

/** 트리의 모든 플레이스홀더를 바깥 → 안쪽, 앞 → 뒤 순서로 돈다. */
export function* walkPlaceholders(tokens: readonly SmartToken[]): Generator<SmartPlaceholder> {
  for (const token of tokens) {
    if (token.kind !== 'placeholder') continue
    yield token
    if (token.body) yield* walkPlaceholders(token.body)
  }
}

/** 이름이 붙은 포매터를 모두 모은다(중복 포함, 등장 순). */
export function formatterNames(tokens: readonly SmartToken[]): string[] {
  const names: string[] = []
  for (const placeholder of walkPlaceholders(tokens)) {
    if (placeholder.formatter !== undefined) names.push(placeholder.formatter)
  }
  return names
}

/**
 * 포매터 형식 부분을 `|` 로 나눈 분기. 중첩 플레이스홀더 안의 `|` 는 나누지 않는다.
 * 분기가 하나뿐이면(`{0:N2}` 처럼 형식 문자열) 길이 1 배열이다.
 */
export function splitBranches(body: readonly SmartToken[]): SmartToken[][] {
  const branches: SmartToken[][] = [[]]
  for (const token of body) {
    const current = branches[branches.length - 1]
    if (!current) continue
    if (token.kind !== 'literal' || !token.text.includes('|')) {
      current.push(token)
      continue
    }
    const parts = token.text.split('|')
    parts.forEach((part, index) => {
      if (index > 0) branches.push([])
      const target = branches[branches.length - 1]
      if (part !== '' && target) target.push({ kind: 'literal', text: part, start: token.start, end: token.end })
    })
  }
  return branches
}
