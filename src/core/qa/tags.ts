/**
 * TextMeshPro 스타일 리치 텍스트 태그. 꺾쇠가 들어간 일반 텍스트(`a < b`)를 태그로 오인하지 않도록
 * 아래 목록에 있는 이름만 태그로 본다. 이름은 대소문자를 가리지 않는다.
 */
export const KNOWN_TAGS: readonly string[] = [
  'align',
  'allcaps',
  'alpha',
  'b',
  'br',
  'color',
  'cspace',
  'font',
  'font-weight',
  'gradient',
  'i',
  'indent',
  'line-height',
  'line-indent',
  'link',
  'lowercase',
  'margin',
  'mark',
  'material',
  'mspace',
  'nobr',
  'noparse',
  'page',
  'pos',
  'quad',
  'rotate',
  's',
  'size',
  'smallcaps',
  'space',
  'sprite',
  'style',
  'sub',
  'sup',
  'u',
  'uppercase',
  'voffset',
  'width'
]

/** 닫는 태그가 없는 태그 */
const VOID_TAGS: ReadonlySet<string> = new Set(['br', 'sprite', 'space', 'pos', 'page', 'quad'])

const KNOWN: ReadonlySet<string> = new Set(KNOWN_TAGS)

export type TagToken = {
  kind: 'open' | 'close' | 'void'
  /** 소문자 이름. `<#ff0000>` 은 color 로 본다. */
  name: string
  /** 비교 단위. 이름 + 속성값. `<color=#ff0000>` → `color=#ff0000` */
  id: string
  /** 원문 그대로의 태그 */
  raw: string
  start: number
  end: number
}

const TAG_PATTERN = /<(\/?)(#[0-9a-fA-F]{3,8}|[A-Za-z][A-Za-z0-9-]*)([^<>\n]*)>/g
/** 속성은 `=값` 이거나 공백 뒤 `이름=값` 이어야 한다. `<b and c>` 같은 글은 태그가 아니다. */
const ATTRS_PATTERN = /^(=|\s+[\w-]+=)/

/** 알려진 태그를 등장 순으로 찾는다. `<noparse>` 안쪽은 태그로 보지 않는다. */
export function scanTags(text: string): TagToken[] {
  const tokens: TagToken[] = []
  const pattern = new RegExp(TAG_PATTERN.source, 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const [raw, slash = '', rawName = '', rawAttrs = ''] = match
    const start = match.index
    const end = start + raw.length

    const hexColor = rawName.startsWith('#')
    const name = hexColor ? 'color' : rawName.toLowerCase()
    if (!KNOWN.has(name)) continue
    const attrs = hexColor ? `=${rawName}` : rawAttrs.trimEnd()

    if (slash === '/') {
      if (hexColor || attrs.trim() !== '') continue
      tokens.push({ kind: 'close', name, id: name, raw, start, end })
      continue
    }
    if (attrs !== '' && !ATTRS_PATTERN.test(attrs)) continue

    const kind = VOID_TAGS.has(name) ? 'void' : 'open'
    const id = attrs === '' || attrs.startsWith('=') ? `${name}${attrs}` : `${name} ${attrs.trim()}`
    tokens.push({ kind, name, id, raw, start, end })

    if (name === 'noparse') {
      const close = text.toLowerCase().indexOf('</noparse>', end)
      if (close === -1) break
      tokens.push({ kind: 'close', name, id: name, raw: text.slice(close, close + 10), start: close, end: close + 10 })
      pattern.lastIndex = close + 10
    }
  }
  return tokens
}

/** 비교할 태그 집합. 여는 태그와 닫는 태그가 없는 태그만 센다 — 닫는 태그는 짝 검사가 본다. */
export function tagIds(tokens: readonly TagToken[]): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const token of tokens) {
    if (token.kind === 'close' || seen.has(token.id)) continue
    seen.add(token.id)
    ids.push(token.id)
  }
  return ids
}

export function compareTagSets(
  source: readonly string[],
  translation: readonly string[]
): { missing: string[]; extra: string[] } {
  const sourceSet = new Set(source)
  const translationSet = new Set(translation)
  return {
    missing: source.filter((id) => !translationSet.has(id)),
    extra: translation.filter((id) => !sourceSet.has(id))
  }
}

export type TagStructure = {
  /** 여는 태그 없이 닫힌 이름 */
  orphanClosers: string[]
  /** 안쪽 태그보다 먼저 닫힌 이름(`<b><i></b></i>` → b) */
  crossed: string[]
  /** 끝까지 닫히지 않은 이름 */
  unclosed: string[]
}

/** 닫는 태그는 이름만으로 짝을 맞춘다. */
export function checkTagStructure(tokens: readonly TagToken[]): TagStructure {
  const stack: string[] = []
  const orphanClosers: string[] = []
  const crossed: string[] = []
  for (const token of tokens) {
    if (token.kind === 'open') {
      stack.push(token.name)
      continue
    }
    if (token.kind === 'void' || VOID_TAGS.has(token.name)) continue
    const index = stack.lastIndexOf(token.name)
    if (index === -1) {
      orphanClosers.push(token.name)
      continue
    }
    if (index !== stack.length - 1) crossed.push(token.name)
    stack.splice(index, 1)
  }
  return { orphanClosers, crossed, unclosed: stack }
}

/** a 에서 b 를 이름별 개수만큼 뺀다. 원문에도 같은 문제가 있으면 번역 탓이 아니다. */
function subtractCounts(a: readonly string[], b: readonly string[]): string[] {
  const remaining = new Map<string, number>()
  for (const name of b) remaining.set(name, (remaining.get(name) ?? 0) + 1)
  const result: string[] = []
  for (const name of a) {
    const left = remaining.get(name) ?? 0
    if (left > 0) remaining.set(name, left - 1)
    else result.push(name)
  }
  return result
}

/**
 * 번역문에만 있는 구조 문제. TMP 는 닫지 않은 태그를 끝까지 적용하므로 원문이 일부러 열어 둔 태그를
 * 번역문이 그대로 따라 했다면 오류로 보지 않는다 — 원문을 고칠 수 없는 번역가가 내보내기에서 막히지 않게.
 */
export function structureProblemsBeyondSource(source: TagStructure, translation: TagStructure): TagStructure {
  return {
    orphanClosers: subtractCounts(translation.orphanClosers, source.orphanClosers),
    crossed: subtractCounts(translation.crossed, source.crossed),
    unclosed: subtractCounts(translation.unclosed, source.unclosed)
  }
}

/** 표시 길이를 셀 때 쓴다. 알려진 태그를 지운 글. */
export function stripTags(text: string): string {
  const tokens = scanTags(text)
  if (tokens.length === 0) return text
  let result = ''
  let cursor = 0
  for (const token of tokens) {
    result += text.slice(cursor, token.start)
    cursor = token.end
  }
  return result + text.slice(cursor)
}
