import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import iconv from 'iconv-lite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sourceHash } from '@core/hash'
import type { MasterRow } from '@shared/schema/strings'
import {
  forgetReadHashes,
  joinRows,
  listTranslationLanguages,
  loadMaster,
  loadTranslations,
  masterPath,
  saveMaster,
  translationPath
} from './store'

let dir: string

function master(key: string, source: string): MasterRow {
  return {
    key,
    source,
    context: '',
    ui_type: '',
    max_len: '',
    vars: '',
    tags: '',
    source_hash: sourceHash(source)
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'babel-store-'))
  forgetReadHashes()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('원문 저장과 읽기', () => {
  it('쉼표·줄바꿈·따옴표가 든 원문이 왕복해도 같다', () => {
    const rows = [
      master('k1', '쉼표, 그리고 "따옴표"'),
      master('k2', '줄바꿈\n두 번째 줄'),
      master('k3', '  앞뒤 공백  ')
    ]
    expect(saveMaster(dir, rows, false).ok).toBe(true)

    forgetReadHashes()
    const loaded = loadMaster(dir)
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows.map((row) => row.source)).toEqual(rows.map((row) => row.source))
  })

  it('저장 직전에 원문 해시를 다시 맞춘다', () => {
    const edited = { ...master('k1', '예전 원문'), source: '새 원문' }
    saveMaster(dir, [edited], false)

    forgetReadHashes()
    const loaded = loadMaster(dir)
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows[0]?.source_hash).toBe(sourceHash('새 원문'))
  })

  it('파일이 없으면 빈 목록', () => {
    const loaded = loadMaster(dir)
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows).toEqual([])
  })
})

describe('행 순서와 빈 파일', () => {
  it('넘긴 순서 그대로 저장하고 다시 읽는다', () => {
    const rows = [master('c', '셋'), master('a', '하나'), master('b', '둘')]
    saveMaster(dir, rows, false)

    forgetReadHashes()
    const loaded = loadMaster(dir)
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows.map((row) => row.key)).toEqual(['c', 'a', 'b'])
  })

  it('행이 없으면 헤더만 있는 파일을 만든다', () => {
    expect(saveMaster(dir, [], false).ok).toBe(true)
    expect(readFileSync(masterPath(dir), 'utf8').trim()).toBe(
      'key,source,context,ui_type,max_len,vars,tags,source_hash'
    )

    forgetReadHashes()
    const loaded = loadMaster(dir)
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.exists).toBe(true)
    expect(loaded.value.rows).toEqual([])
  })

  it('새 행의 빈 해시를 저장할 때 채운다', () => {
    const fresh = { ...master('new', '새 원문'), source_hash: '' }
    saveMaster(dir, [fresh], false)

    forgetReadHashes()
    const loaded = loadMaster(dir)
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows[0]?.source_hash).toBe(sourceHash('새 원문'))
  })
})

describe('인코딩', () => {
  it('CP949 파일을 읽고 알림을 돌려준다', () => {
    const csv = 'key,source\nk1,안녕하세요\n'
    writeFileSync(masterPath(dir), iconv.encode(csv, 'cp949'))

    const loaded = loadMaster(dir)
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows[0]?.source).toBe('안녕하세요')
    expect(loaded.value.notice).toEqual({ file: 'strings_master.csv', encoding: 'cp949' })
  })

  it('CP949로 읽은 파일도 저장하면 UTF-8이 된다', () => {
    writeFileSync(masterPath(dir), iconv.encode('key,source\nk1,안녕하세요\n', 'cp949'))
    const loaded = loadMaster(dir)
    if (!loaded.ok) throw new Error('읽기 실패')

    expect(saveMaster(dir, loaded.value.rows, false).ok).toBe(true)
    const bytes = readFileSync(masterPath(dir))
    expect(bytes.toString('utf8')).toContain('안녕하세요')
    expect(bytes[0]).not.toBe(0xef) // BOM을 붙이지 않는다
  })
})

describe('충돌 감지', () => {
  it('읽은 뒤 파일이 밖에서 바뀌면 저장을 막는다', () => {
    saveMaster(dir, [master('k1', '안녕')], false)
    loadMaster(dir)

    writeFileSync(masterPath(dir), 'key,source,source_hash\nk1,밖에서 바꿈,x\n', 'utf8')

    const result = saveMaster(dir, [master('k1', '앱에서 바꿈')], false)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('conflict')
  })

  it('force면 덮어쓴다', () => {
    saveMaster(dir, [master('k1', '안녕')], false)
    loadMaster(dir)
    writeFileSync(masterPath(dir), 'key,source,source_hash\nk1,밖에서 바꿈,x\n', 'utf8')

    expect(saveMaster(dir, [master('k1', '앱에서 바꿈')], true).ok).toBe(true)
    expect(readFileSync(masterPath(dir), 'utf8')).toContain('앱에서 바꿈')
  })

  it('앱이 쓴 직후에는 충돌이 아니다', () => {
    saveMaster(dir, [master('k1', '안녕')], false)
    expect(saveMaster(dir, [master('k1', '안녕 2')], false).ok).toBe(true)
  })
})

describe('stale 표시', () => {
  it('원문이 바뀌면 해당 언어의 번역이 stale이 된다', () => {
    saveMaster(dir, [master('k1', '안녕'), master('k2', '잘가')], false)
    writeFileSync(
      translationPath(dir, 'en'),
      `key,text,source_hash,status,confidence,note\nk1,Hello,${sourceHash('안녕')},draft,,\nk2,Bye,${sourceHash('잘가')},approved,,\n`,
      'utf8'
    )
    loadTranslations(dir, 'en')

    const result = saveMaster(dir, [master('k1', '안녕하세요'), master('k2', '잘가')], false)
    if (!result.ok) throw new Error('저장 실패')
    expect(result.value.staleKeys).toEqual(['k1'])

    forgetReadHashes()
    const after = loadTranslations(dir, 'en')
    if (!after.ok) throw new Error('읽기 실패')
    const [k1, k2] = after.value.rows
    expect(k1?.status).toBe('stale')
    expect(k1?.text).toBe('Hello')
    expect(k2?.status).toBe('approved')
  })

  it('번역 파일이 없으면 만들지 않는다', () => {
    const result = saveMaster(dir, [master('k1', '안녕')], false)
    expect(result.ok).toBe(true)
    const loaded = loadTranslations(dir, 'en')
    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.value.exists).toBe(false)
  })
})

describe('행 삭제', () => {
  const header = 'key,text,source_hash,status,confidence,note'
  const line = (key: string, text: string, source: string, status = 'draft'): string =>
    `${key},${text},${sourceHash(source)},${status},,`

  it('지운 키는 모든 번역 파일에서 빠진다(대상 언어가 아닌 파일 포함)', () => {
    saveMaster(dir, [master('k1', '안녕'), master('k2', '잘가')], false)
    writeFileSync(translationPath(dir, 'en'), [header, line('k1', 'Hello', '안녕', 'approved'), line('k2', 'Bye', '잘가')].join('\n') + '\n')
    writeFileSync(translationPath(dir, 'fr'), [header, line('k1', 'Bonjour', '안녕'), line('k2', 'Salut', '잘가')].join('\n') + '\n')

    const result = saveMaster(dir, [master('k2', '잘가')], false, ['k1'])
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.removedTranslations).toBe(2)

    forgetReadHashes()
    for (const language of ['en', 'fr']) {
      const loaded = loadTranslations(dir, language)
      if (!loaded.ok) throw new Error('읽기 실패')
      expect(loaded.value.rows.map((row) => row.key)).toEqual(['k2'])
    }
    const masterLoaded = loadMaster(dir)
    if (!masterLoaded.ok) throw new Error('읽기 실패')
    expect(masterLoaded.value.rows.map((row) => row.key)).toEqual(['k2'])
  })

  it('남은 번역은 그대로 둔다', () => {
    saveMaster(dir, [master('k1', '안녕'), master('k2', '잘가')], false)
    writeFileSync(translationPath(dir, 'en'), [header, line('k1', 'Hello', '안녕'), line('k2', 'Bye', '잘가', 'approved')].join('\n') + '\n')

    saveMaster(dir, [master('k2', '잘가')], false, ['k1'])

    forgetReadHashes()
    const loaded = loadTranslations(dir, 'en')
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows).toEqual([
      { key: 'k2', text: 'Bye', source_hash: sourceHash('잘가'), status: 'approved', confidence: '', note: '' }
    ])
  })

  it('그 키가 없는 번역 파일은 다시 쓰지 않는다', () => {
    saveMaster(dir, [master('k1', '안녕'), master('k2', '잘가')], false)
    const original = [header, line('k2', 'Bye', '잘가')].join('\n') + '\n'
    writeFileSync(translationPath(dir, 'en'), original)

    const result = saveMaster(dir, [master('k2', '잘가')], false, ['k1'])
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.removedTranslations).toBe(0)
    expect(readFileSync(translationPath(dir, 'en'), 'utf8')).toBe(original)
  })

  it('번역 파일 목록은 폴더에 있는 파일 기준이다', () => {
    writeFileSync(translationPath(dir, 'ja'), header + '\n')
    writeFileSync(translationPath(dir, 'en'), header + '\n')
    writeFileSync(join(dir, 'translations_.csv'), header + '\n')
    writeFileSync(join(dir, 'notes.csv'), 'a\n')
    expect(listTranslationLanguages(dir)).toEqual(['en', 'ja'])
  })
})

describe('joinRows', () => {
  it('번역이 없으면 미번역으로 본다', () => {
    const joined = joinRows([master('k1', '안녕')], [])
    expect(joined[0]).toMatchObject({ translation: '', status: 'untranslated' })
  })
})
