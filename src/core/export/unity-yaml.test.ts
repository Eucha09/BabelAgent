import { describe, expect, it } from 'vitest'
import { matchIds, parseUnityAsset, selectSharedTable, sniffUnityAsset, uniqueLocales, type UnitySharedTable } from './unity-yaml'
import { ko } from '@shared/i18n/ko'

// 실제 Unity 6000.4 / Localization 1.5.13 파일과 같은 구조(필드·들여쓰기). docs/unity-export.md
const LOCALE = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 0}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: 1bb1838fe8befb0429646b938e757ff3, type: 3}
  m_Name: Korean (ko)
  m_EditorClassIdentifier: Unity.Localization::UnityEngine.Localization.Locale
  m_Identifier:
    m_Code: ko
  m_Metadata:
    m_Items: []
  m_LocaleName: Korean (ko)
  m_CustomFormatCultureCode:
  m_UseCustomFormatter: 0
  m_SortOrder: 10000
  references:
    version: 2
    RefIds: []
`

const SHARED = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_Script: {fileID: 11500000, guid: 5b11a58205ec3474ca216360e9fa74a8, type: 3}
  m_Name: UI Shared Data
  m_EditorClassIdentifier:
  m_TableCollectionName: UI
  m_TableCollectionNameGuidString: 1317265bd367bf24c8c9252ba14c8797
  m_Entries:
  - m_Id: 98006364160
    m_Key: menu.start
    m_Metadata:
      m_Items: []
  - m_Id: 9223372036854775807
    m_Key: No
    m_Metadata:
      m_Items: []
  - m_Id: 3967583154176
    m_Key: 007
    m_Metadata:
      m_Items: []
  - m_Id: 263928586334208
    m_Key: "quote: \\uC548\\uB155"
    m_Metadata:
      m_Items: []
  - m_Id: 285887932035072
    m_Key: a key long enough that the unity yaml writer folded it onto the next
      line
    m_Metadata:
      m_Items: []
  - m_Id: 0
    m_Key: zero.id
  - m_Id: 5
    m_Key:
  m_Metadata:
    m_Items: []
  m_KeyGenerator:
    rid: 1000
  references:
    version: 2
    RefIds:
    - rid: 1000
      type: {class: DistributedUIDGenerator, ns: UnityEngine.Localization.Tables,
        asm: Unity.Localization}
      data:
        m_CustomEpoch: 1629729710612
`

const SETTINGS_HEAD = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_Name: Localization Settings
  m_StringDatabase:
    m_DefaultTableReference:
      m_TableCollectionName:
`

describe('sniffUnityAsset', () => {
  it('로케일·공유 데이터·그 밖·바이너리를 가린다', () => {
    expect(sniffUnityAsset(LOCALE)).toBe('locale')
    expect(sniffUnityAsset(SHARED)).toBe('shared-table')
    expect(sniffUnityAsset(SETTINGS_HEAD)).toBe('other')
    expect(sniffUnityAsset('\u0000\u0000\u0000\u0001UnityFS')).toBe('binary')
  })

  it('PseudoLocale 은 로케일로 보지 않는다', () => {
    expect(sniffUnityAsset(LOCALE.replace('  m_SortOrder', '  m_Methods: []\n  m_SortOrder'))).toBe('other')
  })
})

describe('parseUnityAsset', () => {
  it('로케일 코드와 표시 이름', () => {
    expect(parseUnityAsset(LOCALE, 'locale', ko)).toEqual({ kind: 'locale', locale: { code: 'ko', name: 'Korean (ko)' } })
  })

  it('공유 데이터의 Id·키를 문자열 그대로 읽는다(64비트 Id, No·007, 따옴표, 접힌 줄)', () => {
    const result = parseUnityAsset(SHARED, 'shared-table', ko)
    expect(result.kind).toBe('shared-table')
    if (result.kind !== 'shared-table') return
    expect(result.table.collection).toBe('UI')
    expect(result.table.entries).toEqual([
      { id: '98006364160', key: 'menu.start' },
      { id: '9223372036854775807', key: 'No' },
      { id: '3967583154176', key: '007' },
      { id: '263928586334208', key: 'quote: 안녕' },
      { id: '285887932035072', key: 'a key long enough that the unity yaml writer folded it onto the next line' },
      { id: '0', key: 'zero.id' }
    ])
  })

  it('프리팹의 stripped 꼬리가 있어도 읽는다', () => {
    const text = `${SHARED}--- !u!1 &222 stripped\nGameObject:\n  m_Name: x\n`
    expect(parseUnityAsset(text, 'shared-table', ko).kind).toBe('shared-table')
  })

  it('깨진 YAML 과 필드 없음은 이유를 돌려준다', () => {
    const broken = parseUnityAsset('%YAML 1.1\n--- !u!114 &1\nMonoBehaviour:\n  m_Entries: [\n', 'shared-table', ko)
    expect(broken.kind).toBe('invalid')
    const missing = parseUnityAsset(SETTINGS_HEAD, 'locale', ko)
    expect(missing).toMatchObject({ kind: 'invalid' })
  })
})

describe('공유 데이터 고르기와 Id 맞추기', () => {
  const ui: UnitySharedTable = { collection: 'UI', entries: [{ id: '11', key: 'a' }, { id: '0', key: 'b' }, { id: '33', key: 'only.unity' }] }
  const dialog: UnitySharedTable = { collection: 'Dialog', entries: [] }

  it('하나뿐이면 그것, 여럿이면 고르게 한다', () => {
    expect(selectSharedTable([ui], '')).toEqual({ kind: 'selected', table: ui })
    expect(selectSharedTable([ui, dialog], '')).toEqual({ kind: 'choose' })
    expect(selectSharedTable([ui, dialog], 'Dialog')).toEqual({ kind: 'selected', table: dialog })
    expect(selectSharedTable([ui], 'Gone')).toEqual({ kind: 'missing', name: 'Gone' })
    expect(selectSharedTable([], '')).toEqual({ kind: 'none' })
  })

  it('같은 키의 Id 를 쓰고 0 은 없는 것으로 본다. Unity 에만 있는 키를 센다', () => {
    const match = matchIds(ui, ['a', 'b', 'c'])
    expect([...match.ids]).toEqual([['a', '11']])
    expect(match).toMatchObject({ idFound: 1, newKeys: 2, unityOnlyKeys: 1 })
  })

  it('같은 코드의 로케일은 하나만 남긴다', () => {
    expect(
      uniqueLocales([
        { code: 'ko', name: 'Korean (ko)' },
        { code: 'en', name: 'English (en)' },
        { code: 'KO', name: 'dup' }
      ])
    ).toEqual([
      { code: 'en', name: 'English (en)' },
      { code: 'ko', name: 'Korean (ko)' }
    ])
  })
})
