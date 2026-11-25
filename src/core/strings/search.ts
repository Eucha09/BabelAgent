/**
 * 원문 화면 검색. 키·원문·컨텍스트·지금 고른 언어의 번역을 대소문자 구분 없이 부분 일치로 찾는다.
 * 검토 화면 검색(`core/review/filter.ts`)과 같은 방식이다.
 */
export type SearchableRow = {
  key: string
  source: string
  context: string
  translation: string
}

/** 실제로 찾는 글자. 앞뒤 공백을 빼고 소문자로 맞춘다. */
function needleOf(search: string): string {
  return search.trim().toLowerCase()
}

/** 앞뒤 공백을 뺀 검색어가 비었으면 검색하지 않는 것으로 본다. */
export function isSearching(search: string): boolean {
  return needleOf(search) !== ''
}

/** 두 검색어가 같은 행을 찾는지. 끝에 공백을 치거나 대소문자만 바꾼 것은 검색어를 바꾼 것으로 보지 않는다. */
export function sameSearch(a: string, b: string): boolean {
  return needleOf(a) === needleOf(b)
}

export function matchesStringsSearch(row: SearchableRow, search: string): boolean {
  const needle = needleOf(search)
  if (needle === '') return true
  return [row.key, row.source, row.context, row.translation].some((field) => field.toLowerCase().includes(needle))
}

/**
 * 검색어에 맞는 행만 순서대로 남긴다.
 * `pinned`는 검색 중에 고치거나 추가한 행이다. 입력하다가 검색어와 맞지 않게 돼도 그 자리에서 사라지지 않게
 * 검색어가 바뀔 때까지 남긴다.
 */
export function filterStringsRows<T extends SearchableRow>(
  rows: readonly T[],
  search: string,
  pinned: ReadonlySet<string>
): T[] {
  if (!isSearching(search)) return [...rows]
  return rows.filter((row) => pinned.has(row.key) || matchesStringsSearch(row, search))
}
