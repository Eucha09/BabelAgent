import { parseAllDocuments } from 'yaml'
import { z } from 'zod'
import type { UnityCollectionInfo, UnityLocaleInfo } from '@shared/schema/export'

/**
 * Unity 텍스트 직렬화(YAML) 에셋 읽기. 필드 이름은 실제 파일로 확인했다(docs/unity-export.md):
 * - 로케일: MonoBehaviour.m_Identifier.m_Code, m_LocaleName, m_SortOrder
 * - String Table 공유 데이터: MonoBehaviour.m_TableCollectionName, m_Entries[].m_Id · m_Key
 * 값은 전부 문자열로 읽는다(failsafe 스키마) — m_Id 는 64비트라 숫자로 바꾸면 자리가 깨지고,
 * `m_Key: No`·`007` 같은 키가 불리언·숫자로 바뀌면 안 된다.
 */

export type UnityAssetKind = 'locale' | 'shared-table' | 'binary' | 'other'

export type UnitySharedTable = {
  collection: string
  entries: { id: string; key: string }[]
}

export type UnityAssetParse =
  | { kind: 'locale'; locale: UnityLocaleInfo }
  | { kind: 'shared-table'; table: UnitySharedTable }
  | { kind: 'invalid'; reason: string }

/** 종류를 가릴 때 읽는 파일 앞부분 크기(바이트) */
export const SNIFF_BYTES = 4096

/**
 * 파일 앞부분으로 종류를 가린다. 필드는 MonoBehaviour 바로 아래(들여쓰기 2칸)에 있어야 한다 —
 * Localization Settings 에셋처럼 더 깊이 같은 이름이 나오는 파일을 거르기 위해서다.
 * PseudoLocale(m_Methods 가 있음)은 테이블이 없는 로케일이라 뺀다.
 */
export function sniffUnityAsset(head: string): UnityAssetKind {
  if (!head.startsWith('%YAML')) return 'binary'
  if (/^ {2}m_TableCollectionName:/m.test(head) && /^ {2}m_Entries:/m.test(head)) return 'shared-table'
  if (/^ {2}m_Identifier:/m.test(head) && !/^ {2}m_Methods:/m.test(head) && /^ {2}m_SortOrder:/m.test(head)) return 'locale'
  return 'other'
}

const LocaleDocument = z.object({
  MonoBehaviour: z.object({
    m_Name: z.string().optional(),
    m_Identifier: z.object({ m_Code: z.string() }),
    m_LocaleName: z.string().optional()
  })
})

const SharedTableDocument = z.object({
  MonoBehaviour: z.object({
    m_TableCollectionName: z.string(),
    m_Entries: z.array(z.object({ m_Id: z.string(), m_Key: z.string() }))
  })
})

/** 프리팹 파일의 `--- !u!1 &123 stripped` 꼬리는 YAML 이 아니다. 지워도 값은 같다. */
function normalizeUnityYaml(text: string): string {
  return text.replace(/^(--- !u!\d+ &-?\d+) stripped[ \t]*$/gm, '$1')
}

function documents(text: string): { values: unknown[]; error: string | null } {
  const values: unknown[] = []
  for (const document of parseAllDocuments(normalizeUnityYaml(text), { schema: 'failsafe' })) {
    const error = document.errors[0]
    if (error) return { values, error: error.message.split('\n')[0] ?? error.message }
    values.push(document.toJS())
  }
  return { values, error: null }
}

/** 로케일 또는 공유 데이터 에셋 하나를 읽는다. kind 는 sniffUnityAsset 결과. */
export function parseUnityAsset(text: string, kind: 'locale' | 'shared-table'): UnityAssetParse {
  const { values, error } = documents(text)
  if (error !== null) return { kind: 'invalid', reason: `YAML 오류: ${error}` }

  if (kind === 'locale') {
    for (const value of values) {
      const parsed = LocaleDocument.safeParse(value)
      if (!parsed.success) continue
      const { m_Identifier, m_LocaleName, m_Name } = parsed.data.MonoBehaviour
      const code = m_Identifier.m_Code.trim()
      if (code === '') return { kind: 'invalid', reason: '로케일 코드(m_Identifier.m_Code)가 비어 있습니다.' }
      const name = (m_LocaleName ?? '').trim() || (m_Name ?? '').trim() || code
      return { kind: 'locale', locale: { code, name } }
    }
    return { kind: 'invalid', reason: 'm_Identifier.m_Code 를 찾지 못했습니다.' }
  }

  for (const value of values) {
    const parsed = SharedTableDocument.safeParse(value)
    if (!parsed.success) continue
    const { m_TableCollectionName, m_Entries } = parsed.data.MonoBehaviour
    return {
      kind: 'shared-table',
      table: {
        collection: m_TableCollectionName,
        // Unity 는 빈 키를 내보내지 않는다
        entries: m_Entries.filter((entry) => entry.m_Key !== '').map((entry) => ({ id: entry.m_Id.trim(), key: entry.m_Key }))
      }
    }
  }
  return { kind: 'invalid', reason: 'm_TableCollectionName·m_Entries 를 찾지 못했습니다.' }
}

/** 같은 코드(대소문자 무시)의 로케일이 여러 에셋에 있으면 처음 것만 둔다. 코드 순으로 정렬. */
export function uniqueLocales(locales: readonly UnityLocaleInfo[]): UnityLocaleInfo[] {
  const byCode = new Map<string, UnityLocaleInfo>()
  for (const locale of locales) {
    const lower = locale.code.toLowerCase()
    if (!byCode.has(lower)) byCode.set(lower, locale)
  }
  return [...byCode.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

export function collectionInfos(tables: readonly UnitySharedTable[]): UnityCollectionInfo[] {
  return tables
    .map((table) => ({ name: table.collection, entries: table.entries.length }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

export type TableSelection =
  | { kind: 'selected'; table: UnitySharedTable }
  /** 컬렉션이 여럿인데 고르지 않았다 */
  | { kind: 'choose' }
  | { kind: 'missing'; name: string }
  | { kind: 'none' }

/** 고른 이름의 공유 데이터. 이름을 비워 두면 하나뿐일 때 그것을 쓴다. */
export function selectSharedTable(tables: readonly UnitySharedTable[], name: string): TableSelection {
  if (tables.length === 0) return { kind: 'none' }
  if (name !== '') {
    const table = tables.find((item) => item.collection === name)
    return table ? { kind: 'selected', table } : { kind: 'missing', name }
  }
  const only = tables.length === 1 ? tables[0] : undefined
  return only ? { kind: 'selected', table: only } : { kind: 'choose' }
}

export type IdMatch = {
  ids: Map<string, string>
  idFound: number
  newKeys: number
  unityOnlyKeys: number
}

/** 내보내는 키마다 같은 m_Key 의 m_Id. Id 가 비었거나 0 이면 없는 것으로 본다(Unity 도 새 Id 를 붙인다). */
export function matchIds(table: UnitySharedTable, keys: readonly string[]): IdMatch {
  const byKey = new Map<string, string>()
  for (const entry of table.entries) {
    if (entry.id !== '' && entry.id !== '0' && !byKey.has(entry.key)) byKey.set(entry.key, entry.id)
  }
  const ids = new Map<string, string>()
  for (const key of keys) {
    const id = byKey.get(key)
    if (id !== undefined) ids.set(key, id)
  }
  const keySet = new Set(keys)
  const unityOnlyKeys = new Set(table.entries.map((entry) => entry.key).filter((key) => !keySet.has(key))).size
  return { ids, idFound: ids.size, newKeys: keys.length - ids.size, unityOnlyKeys }
}
