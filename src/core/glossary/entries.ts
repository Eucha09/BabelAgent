import type { GlossaryEntry, GlossarySkipReason, GlossaryStatus } from '@shared/schema/glossary'

/**
 * glossary.csv 레코드 ↔ 화면용 항목. 파일의 열은 docs/data-format.md 의 "glossary.csv".
 * 레코드를 통째로 다시 만들지 않고 바뀐 칸만 고쳐 쓴다 — 사용자가 더한 열과 손대지 않은 칸의 표기가 남는다.
 */

/**
 * 대상 언어 열 뒤에 오는 열. reason·confidence 는 에이전트 후보의 근거와 신뢰도다.
 * pending_languages 는 승인된 용어에서 아직 승인을 기다리는 언어(용어 번역 작업이 빈 칸을 채운 언어)다.
 */
export const GLOSSARY_TAIL_COLUMNS = ['pos', 'note', 'strict', 'status', 'pending_languages', 'reason', 'confidence'] as const

export const PENDING_LANGUAGES_COLUMN = 'pending_languages'

export function translationColumn(language: string): string {
  return `translation_${language}`
}

/** 용어의 정체. 대소문자와 앞뒤 공백을 무시한다 — QA 의 용어 탐지도 대소문자를 보지 않는다. */
export function termKey(term: string): string {
  return term.trim().toLowerCase()
}

/** status 가 비었으면 사람이 직접 쓴 용어로 보고 승인된 것으로 친다. 그 밖의 값은 승인 전이다. */
export function glossaryStatusOf(raw: string): GlossaryStatus {
  const value = raw.trim().toLowerCase()
  return value === '' || value === 'approved' ? 'approved' : 'pending'
}

export function isStrict(raw: string): boolean {
  return raw.trim().toLowerCase() === 'true'
}

/** pending_languages 칸을 언어 코드 목록으로. `;`·`,`·공백으로 나눈 것을 모두 받고 겹친 코드는 하나로 친다. */
export function parsePendingLanguages(raw: string): string[] {
  const codes = raw
    .split(/[;,\s]+/)
    .map((code) => code.trim())
    .filter((code) => code !== '')
  return [...new Set(codes)]
}

export function formatPendingLanguages(languages: readonly string[]): string {
  return [...new Set(languages)].join(';')
}

/**
 * 이 언어의 확정 번역을 번역 프롬프트와 QA 에 쓸 수 있는지. 용어가 승인되어 있고 그 언어가 승인 대기가 아니어야 한다.
 * 승인 대기 용어는 언어와 상관없이 쓰지 않는다.
 */
export function isTranslationConfirmed(record: Readonly<Record<string, string>>, language: string): boolean {
  if (glossaryStatusOf(record['status'] ?? '') !== 'approved') return false
  return !parsePendingLanguages(record[PENDING_LANGUAGES_COLUMN] ?? '').includes(language)
}

/**
 * 쓸 때의 헤더. 있던 열은 순서 그대로 두고, 빠진 대상 언어 열은 마지막 번역 열 뒤에, 빠진 나머지 열은 끝에 붙인다.
 * 파일이 없으면 term → 대상 언어 → 나머지 순서로 만든다.
 */
export function glossaryHeader(existing: readonly string[], languages: readonly string[]): string[] {
  const header = existing.length === 0 ? ['term'] : [...existing]
  if (!header.includes('term')) header.unshift('term')

  const missing = languages.map(translationColumn).filter((column) => !header.includes(column))
  if (missing.length > 0) {
    let at = header.indexOf('term')
    header.forEach((column, index) => {
      if (column.startsWith('translation_')) at = index
    })
    header.splice(at + 1, 0, ...missing)
  }
  for (const column of GLOSSARY_TAIL_COLUMNS) {
    if (!header.includes(column)) header.push(column)
  }
  return header
}

export function toGlossaryEntry(record: Readonly<Record<string, string>>, languages: readonly string[]): GlossaryEntry {
  return {
    term: (record['term'] ?? '').trim(),
    translations: Object.fromEntries(languages.map((language) => [language, record[translationColumn(language)] ?? ''])),
    pos: record['pos'] ?? '',
    note: record['note'] ?? '',
    strict: isStrict(record['strict'] ?? ''),
    status: glossaryStatusOf(record['status'] ?? ''),
    pendingLanguages: parsePendingLanguages(record[PENDING_LANGUAGES_COLUMN] ?? ''),
    reason: record['reason'] ?? '',
    confidence: record['confidence'] ?? ''
  }
}

/**
 * 항목을 레코드로 되돌린다. base 의 다른 열은 그대로 두고, strict·status 는 뜻이 같으면 원래 표기를 지킨다
 * (빈 status 를 approved 로, 빈 strict 를 false 로 바꿔 쓰지 않는다).
 */
export function fromGlossaryEntry(
  entry: GlossaryEntry,
  base?: Readonly<Record<string, string>>
): Record<string, string> {
  const record: Record<string, string> = { ...base }
  record['term'] = entry.term.trim()
  for (const [language, text] of Object.entries(entry.translations)) record[translationColumn(language)] = text
  record['pos'] = entry.pos
  record['note'] = entry.note
  const rawStrict = base?.['strict']
  record['strict'] = rawStrict !== undefined && isStrict(rawStrict) === entry.strict ? rawStrict : String(entry.strict)
  const rawStatus = base?.['status']
  record['status'] = rawStatus !== undefined && glossaryStatusOf(rawStatus) === entry.status ? rawStatus : entry.status
  const rawPending = base?.[PENDING_LANGUAGES_COLUMN]
  record[PENDING_LANGUAGES_COLUMN] =
    rawPending !== undefined && samePendingLanguages(parsePendingLanguages(rawPending), entry.pendingLanguages)
      ? rawPending
      : formatPendingLanguages(entry.pendingLanguages)
  record['reason'] = entry.reason
  record['confidence'] = entry.confidence
  return record
}

/** 순서와 겹침을 무시하고 같은 언어 목록인지 */
function samePendingLanguages(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a)
  const right = new Set(b)
  return left.size === right.size && [...left].every((code) => right.has(code))
}

/** 화면이 본 행과 지금 행이 같은지. 번역은 화면이 본 언어만 비교한다(그 사이 대상 언어가 늘었을 수 있다). */
export function sameEntry(current: GlossaryEntry, expected: GlossaryEntry): boolean {
  if (
    current.term !== expected.term.trim() ||
    current.pos !== expected.pos ||
    current.note !== expected.note ||
    current.strict !== expected.strict ||
    current.status !== expected.status ||
    !samePendingLanguages(current.pendingLanguages, expected.pendingLanguages) ||
    current.reason !== expected.reason ||
    current.confidence !== expected.confidence
  ) {
    return false
  }
  return Object.entries(expected.translations).every(([language, text]) => (current.translations[language] ?? '') === text)
}

export type GlossaryEntries = {
  /** 용어가 빈 행과 겹친 행(첫 행 말고)을 뺀 항목 */
  entries: GlossaryEntry[]
  duplicates: string[]
}

export function toGlossaryEntries(
  records: readonly Readonly<Record<string, string>>[],
  languages: readonly string[]
): GlossaryEntries {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const entries: GlossaryEntry[] = []
  for (const record of records) {
    const entry = toGlossaryEntry(record, languages)
    if (entry.term === '') continue
    const key = termKey(entry.term)
    if (seen.has(key)) {
      duplicates.add(entry.term)
      continue
    }
    seen.add(key)
    entries.push(entry)
  }
  return { entries, duplicates: [...duplicates] }
}

function indexOfTerm(records: readonly Readonly<Record<string, string>>[], term: string): number {
  const key = termKey(term)
  return records.findIndex((record) => termKey(record['term'] ?? '') === key)
}

export type GlossaryChangeInput = {
  original: string | null
  next: GlossaryEntry | null
  expected: GlossaryEntry | null
}

export type GlossaryChangeResult = {
  records: Record<string, string>[]
  applied: string[]
  skipped: { term: string; reason: GlossarySkipReason }[]
}

/**
 * 화면에서 고친 용어들을 레코드에 차례로 적용한다. 순수 함수 — 파일은 호출한 쪽이 다시 읽어 넘기고 쓴다.
 * 화면이 본 뒤 바뀐 행(추출 작업이 고친 행, 앱 밖 편집)은 덮지 않고 건너뛴다. 나머지 행은 그대로 쓴다.
 */
export function applyGlossaryChanges(
  records: readonly Readonly<Record<string, string>>[],
  changes: readonly GlossaryChangeInput[],
  languages: readonly string[]
): GlossaryChangeResult {
  const next: Record<string, string>[] = records.map((record) => ({ ...record }))
  const applied: string[] = []
  const skipped: GlossaryChangeResult['skipped'] = []

  for (const change of changes) {
    const label = change.next?.term.trim() || change.original || ''
    if (change.next && change.next.term.trim() === '') {
      skipped.push({ term: label, reason: 'invalid' })
      continue
    }

    if (change.original === null) {
      if (!change.next) continue
      if (indexOfTerm(next, change.next.term) !== -1) {
        skipped.push({ term: label, reason: 'exists' })
        continue
      }
      next.push(fromGlossaryEntry(change.next))
      applied.push(change.next.term.trim())
      continue
    }

    const index = indexOfTerm(next, change.original)
    const record = next[index]
    if (!record) {
      skipped.push({ term: label, reason: 'missing' })
      continue
    }
    if (change.expected && !sameEntry(toGlossaryEntry(record, languages), change.expected)) {
      skipped.push({ term: label, reason: 'changed' })
      continue
    }

    if (!change.next) {
      next.splice(index, 1)
      applied.push(change.original)
      continue
    }
    const renamedTo = indexOfTerm(next, change.next.term)
    if (renamedTo !== -1 && renamedTo !== index) {
      skipped.push({ term: label, reason: 'exists' })
      continue
    }
    next[index] = fromGlossaryEntry(change.next, record)
    applied.push(change.next.term.trim())
  }

  return { records: next, applied, skipped }
}

/** 에이전트가 낸 용어 후보. 승인 전까지 pending 으로 들어간다. */
export type GlossaryCandidate = {
  term: string
  pos: string
  note: string
  translations: Record<string, string>
  reason: string
  confidence: number
  /** 사용자가 [용어 추가]에서 켠 경우. 에이전트 후보는 기본 false */
  strict?: boolean
}

export type AppendCandidatesResult = {
  records: Record<string, string>[]
  added: string[]
  /** 이미 있는 용어(승인 대기 포함)라 넣지 않은 후보 */
  existing: string[]
}

/**
 * 후보를 pending 으로 붙인다. 이미 있는 용어와 같은 제출 안에서 겹친 후보는 넣지 않는다 —
 * 병렬 배치가 같은 용어를 내면 먼저 기록한 쪽만 남는다.
 */
export function appendCandidates(
  records: readonly Readonly<Record<string, string>>[],
  candidates: readonly GlossaryCandidate[],
  languages: readonly string[]
): AppendCandidatesResult {
  const next: Record<string, string>[] = records.map((record) => ({ ...record }))
  const known = new Set(next.map((record) => termKey(record['term'] ?? '')))
  const added: string[] = []
  const existing: string[] = []

  for (const candidate of candidates) {
    const term = candidate.term.trim()
    const key = termKey(term)
    if (key === '') continue
    if (known.has(key)) {
      existing.push(term)
      continue
    }
    known.add(key)
    next.push(
      fromGlossaryEntry({
        term,
        translations: Object.fromEntries(languages.map((language) => [language, candidate.translations[language] ?? ''])),
        pos: candidate.pos,
        note: candidate.note,
        strict: candidate.strict ?? false,
        status: 'pending',
        pendingLanguages: [],
        reason: candidate.reason,
        confidence: String(Math.round(candidate.confidence * 100) / 100)
      })
    )
    added.push(term)
  }
  return { records: next, added, existing }
}
