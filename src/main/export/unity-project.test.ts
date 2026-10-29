import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkUnityProject, resolveUnityPath, scanUnityProject, toStoredUnityPath } from './unity-project'

const locale = (code: string): string => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_Name: ${code}
  m_Identifier:
    m_Code: ${code}
  m_Metadata:
    m_Items: []
  m_LocaleName: Name (${code})
  m_SortOrder: 10000
`

const shared = (collection: string, keys: string[]): string => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_Name: ${collection} Shared Data
  m_TableCollectionName: ${collection}
  m_TableCollectionNameGuidString: 0
  m_Entries:
${keys.map((key, index) => `  - m_Id: ${(BigInt('9007199254740993') + BigInt(index)).toString()}\n    m_Key: ${key}\n    m_Metadata:\n      m_Items: []`).join('\n')}
`

let root: string
let unity: string

const write = (relative: string, text: string | Buffer): void => {
  const path = join(unity, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'babel-unity-'))
  unity = join(root, 'Game')
  mkdirSync(join(unity, 'Assets'), { recursive: true })
  mkdirSync(join(unity, 'ProjectSettings'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('경로', () => {
  it('프로젝트 폴더 기준 상대 경로로 저장하고 되돌린다', () => {
    const project = join(root, 'Babel')
    const stored = toStoredUnityPath(project, unity)
    expect(stored).toBe('../Game')
    expect(resolveUnityPath(project, stored)).toBe(unity)
  })

  it('Assets·ProjectSettings 가 없으면 Unity 프로젝트가 아니다', () => {
    expect(checkUnityProject(unity)).toBeNull()
    expect(checkUnityProject(join(root, 'none'))).not.toBeNull()
    rmSync(join(unity, 'ProjectSettings'), { recursive: true })
    expect(checkUnityProject(unity)).toContain('ProjectSettings')
  })
})

describe('scanUnityProject', () => {
  it('로케일과 공유 데이터를 읽고, Unity 가 무시하는 폴더와 다른 에셋은 건너뛴다', async () => {
    write('Assets/_Locale/English (en).asset', locale('en'))
    write('Assets/_Locale/Korean (ko).asset', locale('ko'))
    write('Assets/Tables/UI Shared Data.asset', shared('UI', ['menu.start', 'No']))
    write('Assets/Hidden~/Old Shared Data.asset', shared('Old', ['x']))
    write('Assets/.cache/ja.asset', locale('ja'))
    write('Assets/Other.asset', '%YAML 1.1\n--- !u!114 &1\nMonoBehaviour:\n  m_Name: other\n')
    write('Assets/Binary.asset', Buffer.from([0, 0, 0, 1, 2, 3]))

    const result = await scanUnityProject(unity, '../Game')
    expect(result.state).toBe('ok')
    if (result.state !== 'ok') return
    expect(result.locales.map((item) => item.code).sort()).toEqual(['en', 'ko'])
    expect(result.tables).toEqual([
      {
        collection: 'UI',
        entries: [
          { id: '9007199254740993', key: 'menu.start' },
          { id: '9007199254740994', key: 'No' }
        ]
      }
    ])
    expect(result.notices).toHaveLength(1)
    expect(result.notices[0]).toContain('바이너리 에셋 1개')
  })

  it('깨진 에셋은 알림으로 남기고 나머지는 읽는다', async () => {
    write('Assets/en.asset', locale('en'))
    write('Assets/Broken Shared Data.asset', '%YAML 1.1\n--- !u!114 &1\nMonoBehaviour:\n  m_TableCollectionName: X\n  m_Entries: [\n')
    const result = await scanUnityProject(unity, '../Game')
    expect(result.state).toBe('ok')
    if (result.state !== 'ok') return
    expect(result.notices[0]).toContain('Broken Shared Data.asset')
  })

  it('바이너리 직렬화뿐이면 Force Text 를 안내한다', async () => {
    write('Assets/a.asset', Buffer.from([0, 1, 2]))
    const result = await scanUnityProject(unity, '../Game')
    expect(result).toMatchObject({ state: 'failed' })
    if (result.state === 'failed') expect(result.reason).toContain('Force Text')
  })

  it('Localization 에셋이 없으면 실패 이유를 돌려준다', async () => {
    write('Assets/Other.asset', '%YAML 1.1\n--- !u!114 &1\nMonoBehaviour:\n  m_Name: other\n')
    const result = await scanUnityProject(unity, '../Game')
    expect(result).toMatchObject({ state: 'failed' })
    expect((await scanUnityProject(join(root, 'none'), 'none')).state).toBe('failed')
  })
})
