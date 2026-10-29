import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import iconv from 'iconv-lite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sourceHash } from '@core/hash'
import type { ContextSuggestion } from '@shared/schema/context'
import type { MasterRow } from '@shared/schema/strings'
import {
  appendGlossaryCandidates,
  applyContextSuggestions,
  approveTranslationRows,
  discardContextSuggestions,
  GLOSSARY_FILE,
  loadContextSuggestions,
  loadGlossary,
  updateGlossary,
  writeContextSuggestions,
  forgetReadHashes,
  joinRows,
  listTranslationLanguages,
  loadGlossaryTerms,
  loadMaster,
  loadTranslations,
  masterPath,
  saveMaster,
  translationPath,
  updateTranslationRow,
  writeBatchTranslations,
  type RowUpdate
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
    smart: '',
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
      'key,source,context,ui_type,max_len,vars,smart,tags,source_hash'
    )

    forgetReadHashes()
    const loaded = loadMaster(dir)
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.exists).toBe(true)
    expect(loaded.value.rows).toEqual([])
  })

  it('smart 열이 없는 옛 원문도 읽고, 저장하면 열을 더하며 칸 글자는 그대로 둔다', () => {
    writeFileSync(masterPath(dir), `key,source,source_hash\na,{0}개,${sourceHash('{0}개')}\n`)
    const old = loadMaster(dir)
    if (!old.ok) throw new Error('읽기 실패')
    expect(old.value.rows[0]?.smart).toBe('')

    saveMaster(dir, [{ ...master('a', '{0}개'), smart: 'TRUE' }], false)
    forgetReadHashes()
    const loaded = loadMaster(dir)
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows[0]?.smart).toBe('TRUE')
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
      { key: 'k2', text: 'Bye', source_hash: sourceHash('잘가'), status: 'approved', confidence: '', note: '', source_snapshot: '' }
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

describe('배치 번역 기록', () => {
  const header = 'key,text,source_hash,status,confidence,note'

  it('번역 파일이 없으면 만들고 draft 로 기록한다', () => {
    const result = writeBatchTranslations(dir, 'en', [{ key: 'k1', text: 'Hello', confidence: 0.9 }], new Map([['k1', { source: '안녕', source_hash: 'h1' }]]))
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.written).toBe(1)

    forgetReadHashes()
    const loaded = loadTranslations(dir, 'en')
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows).toEqual([{ key: 'k1', text: 'Hello', source_hash: 'h1', status: 'draft', confidence: '0.9', note: '', source_snapshot: '안녕' }])
  })

  it('approved 는 덮지 않고, 다른 행은 그대로 둔다', () => {
    writeFileSync(translationPath(dir, 'en'), [header, 'ok,Kept,h-ok,approved,1,', 'other,Other,h-o,review,0.7,'].join('\n') + '\n')
    const result = writeBatchTranslations(dir, 'en', [{ key: 'ok', text: 'Overwrite', confidence: 0.9 }, { key: 'new', text: 'New', confidence: 0.8 }], new Map([['ok', { source: 'OK', source_hash: 'h-ok' }], ['new', { source: 'N', source_hash: 'h-n' }]]))
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.skippedApproved).toEqual(['ok'])

    forgetReadHashes()
    const loaded = loadTranslations(dir, 'en')
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows.map((row) => [row.key, row.text, row.status])).toEqual([
      ['ok', 'Kept', 'approved'],
      ['other', 'Other', 'review'],
      ['new', 'New', 'draft']
    ])
  })

  it('용어집이 없으면 빈 목록, 있으면 승인된 해당 언어 용어', () => {
    const empty = loadGlossaryTerms(dir, 'en')
    expect(empty.ok && empty.value).toEqual([])
    writeFileSync(join(dir, 'glossary.csv'), ['term,translation_en,status,note,strict', '물약,Potion,approved,,', '검,Sword,pending,,'].join('\n') + '\n')
    const loaded = loadGlossaryTerms(dir, 'en')
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.map((term) => term.term)).toEqual(['물약'])
  })
})

describe('joinRows', () => {
  it('번역이 없으면 미번역으로 본다', () => {
    const joined = joinRows([master('k1', '안녕')], [])
    expect(joined[0]).toMatchObject({ translation: '', status: 'untranslated' })
  })
})

describe('joinRows 의 이전 원문', () => {
  it('해시와 맞는 스냅숏만 넘긴다', () => {
    const translation = (snapshot: string, hash: string) => ({
      key: 'k1', text: 'Hi', source_hash: hash, status: 'stale' as const, confidence: '', note: '', source_snapshot: snapshot
    })
    expect(joinRows([master('k1', '새 원문')], [translation('옛 원문', sourceHash('옛 원문'))])[0]?.source_snapshot).toBe('옛 원문')
    expect(joinRows([master('k1', '새 원문')], [translation('밖에서 고침', sourceHash('옛 원문'))])[0]?.source_snapshot).toBe('')
  })

  it('번역 → 원문 수정 → stale 이 되어도 번역할 때 본 원문이 남는다', () => {
    saveMaster(dir, [master('k1', '슬라임 3마리')], false)
    writeBatchTranslations(dir, 'en', [{ key: 'k1', text: 'Slay 3 slimes', confidence: 0.9 }], new Map([['k1', master('k1', '슬라임 3마리')]]))
    saveMaster(dir, [master('k1', '슬라임 5마리')], false)

    const masterLoaded = loadMaster(dir)
    const loaded = loadTranslations(dir, 'en')
    if (!masterLoaded.ok || !loaded.ok) throw new Error('읽기 실패')
    const [row] = joinRows(masterLoaded.value.rows, loaded.value.rows)
    expect(row).toMatchObject({ status: 'stale', source: '슬라임 5마리', source_snapshot: '슬라임 3마리', translation: 'Slay 3 slimes' })
  })
})

describe('행 단위 저장', () => {
  const noQa = () => []
  const update = (partial: Partial<RowUpdate> & Pick<RowUpdate, 'change'>): RowUpdate => ({
    key: 'k1',
    master: master('k1', '안녕'),
    expected: { text: '', status: 'untranslated' },
    force: false,
    ...partial
  })

  it('번역 파일이 없으면 만들고, 지금 원문을 함께 남긴다', () => {
    const result = updateTranslationRow(dir, 'en', update({ change: { text: 'Hello', status: 'draft' } }), noQa)
    if (!result.ok) throw new Error(result.error.message)
    forgetReadHashes()
    const loaded = loadTranslations(dir, 'en')
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows).toEqual([
      { key: 'k1', text: 'Hello', source_hash: sourceHash('안녕'), status: 'draft', confidence: '', note: '', source_snapshot: '안녕' }
    ])
  })

  it('빈 미번역 행은 파일을 만들지 않는다', () => {
    const result = updateTranslationRow(dir, 'en', update({ change: { text: '', status: 'untranslated' } }), noQa)
    expect(result.ok).toBe(true)
    expect(listTranslationLanguages(dir)).toEqual([])
  })

  it('편집하는 사이 디스크의 그 행이 바뀌면 충돌, force 면 덮는다', () => {
    writeFileSync(translationPath(dir, 'en'), ['key,text,source_hash,status,confidence,note', `k1,From job,${sourceHash('안녕')},draft,0.8,`].join('\n') + '\n')
    const stale = update({ change: { text: 'Mine', status: 'draft' }, expected: { text: 'Before', status: 'draft' } })
    const conflict = updateTranslationRow(dir, 'en', stale, noQa)
    expect(!conflict.ok && conflict.error.kind).toBe('conflict')

    const forced = updateTranslationRow(dir, 'en', { ...stale, force: true }, noQa)
    expect(forced.ok && forced.value.row.text).toBe('Mine')
  })

  it('다른 행이 밖에서 바뀐 것은 그대로 남긴다', () => {
    writeFileSync(translationPath(dir, 'en'), ['key,text,source_hash,status,confidence,note', 'k1,Old,h,draft,,', 'k2,Other,h,draft,,'].join('\n') + '\n')
    loadTranslations(dir, 'en')
    writeFileSync(translationPath(dir, 'en'), ['key,text,source_hash,status,confidence,note', 'k1,Old,h,draft,,', 'k2,Changed outside,h,review,,'].join('\n') + '\n')

    const result = updateTranslationRow(dir, 'en', update({ change: { text: 'New', status: 'draft' }, expected: { text: 'Old', status: 'draft' } }), noQa)
    if (!result.ok) throw new Error(result.error.message)
    forgetReadHashes()
    const loaded = loadTranslations(dir, 'en')
    if (!loaded.ok) throw new Error('읽기 실패')
    expect(loaded.value.rows.map((row) => [row.key, row.text, row.status])).toEqual([
      ['k1', 'New', 'draft'],
      ['k2', 'Changed outside', 'review']
    ])
  })

  it('QA 오류가 있으면 승인하지 않는다', () => {
    const qa = () => [{ ruleId: 'var.missing' as const, severity: 'error' as const, key: 'k1', message: '변수 없음', items: [] }]
    const result = updateTranslationRow(dir, 'en', update({ change: { text: 'Hello', status: 'approved' } }), qa)
    expect(!result.ok && result.error.message).toBe('QA 오류가 있어 승인할 수 없습니다.')
    expect(updateTranslationRow(dir, 'en', update({ change: { text: 'Hello', status: 'draft' } }), qa).ok).toBe(true)
  })

  it('상태 규칙을 어기면 거부한다', () => {
    const result = updateTranslationRow(dir, 'en', update({ change: { text: '', status: 'approved' } }), noQa)
    expect(!result.ok && result.error.kind).toBe('invalid-input')
  })
})

describe('일괄 승인', () => {
  const header = 'key,text,source_hash,status,confidence,note,source_snapshot'
  const masterByKey = new Map([
    ['a', master('a', '가')],
    ['b', master('b', '나')],
    ['c', master('c', '다')]
  ])
  const line = (key: string, text: string, status: string, source: string) => `${key},${text},${sourceHash(source)},${status},0.9,,${source}`

  beforeEach(() => {
    writeFileSync(
      translationPath(dir, 'en'),
      [header, line('a', 'A', 'draft', '가'), line('b', 'B', 'draft', '나'), line('c', 'C', 'draft', '다')].join('\n') + '\n'
    )
  })

  const statuses = (): string[][] => {
    forgetReadHashes()
    const loaded = loadTranslations(dir, 'en')
    if (!loaded.ok) throw new Error('읽기 실패')
    return loaded.value.rows.map((row) => [row.key, row.status])
  }

  it('조건을 통과한 행만 한 번에 승인한다', () => {
    const result = approveTranslationRows(
      dir,
      'en',
      [
        { key: 'a', expected: { text: 'A', status: 'draft' } },
        { key: 'b', expected: { text: 'B', status: 'draft' } }
      ],
      masterByKey,
      (row) => (row.key === 'b' ? 'has-diagnostics' : null)
    )
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value).toEqual({ approved: ['a'], skipped: [{ key: 'b', reason: 'has-diagnostics' }] })
    expect(statuses()).toEqual([
      ['a', 'approved'],
      ['b', 'draft'],
      ['c', 'draft']
    ])
  })

  it('화면이 본 뒤 바뀐 행과 없는 키는 건너뛴다', () => {
    const result = approveTranslationRows(
      dir,
      'en',
      [
        { key: 'a', expected: { text: 'Old A', status: 'draft' } },
        { key: 'zzz', expected: { text: 'Z', status: 'draft' } },
        { key: 'c', expected: { text: 'C', status: 'draft' } }
      ],
      masterByKey,
      () => null
    )
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.approved).toEqual(['c'])
    expect(result.value.skipped).toEqual([
      { key: 'a', reason: 'changed' },
      { key: 'zzz', reason: 'missing' }
    ])
  })

  it('통과한 행이 없으면 파일을 쓰지 않는다', () => {
    const before = readFileSync(translationPath(dir, 'en'), 'utf8')
    const result = approveTranslationRows(dir, 'en', [{ key: 'a', expected: { text: 'A', status: 'draft' } }], masterByKey, () => 'low-confidence')
    expect(result.ok && result.value.approved).toEqual([])
    expect(readFileSync(translationPath(dir, 'en'), 'utf8')).toBe(before)
  })
})

describe('용어집 화면 저장', () => {
  const languages = ['en', 'ja']
  const write = (text: string): void => writeFileSync(join(dir, GLOSSARY_FILE), text)

  it('파일이 없으면 표준 열로 만들고, 사람이 추가한 용어는 승인 상태다', () => {
    const result = updateGlossary(
      dir,
      [
        {
          original: null,
          next: { term: '바벨탑', translations: { en: 'Tower of Babel', ja: '' }, pos: '', note: '', strict: true, status: 'approved', reason: '', confidence: '' },
          expected: null
        }
      ],
      languages
    )
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.applied).toEqual(['바벨탑'])
    expect(readFileSync(join(dir, GLOSSARY_FILE), 'utf8').split('\n')[0]).toBe(
      'term,translation_en,translation_ja,pos,note,strict,status,reason,confidence'
    )
    const terms = loadGlossaryTerms(dir, 'en')
    expect(terms.ok && terms.value).toEqual([{ term: '바벨탑', translation: 'Tower of Babel', note: '', strict: true }])
  })

  it('사용자 열과 다른 행을 지키고, 화면이 본 뒤 바뀐 행은 건너뛴다', () => {
    write('term,translation_en,memo\n물약,Potion,메모\n마나,Mana,\n')
    const view = loadGlossary(dir, languages)
    if (!view.ok) throw new Error('읽기 실패')
    const [potion, mana] = view.value.entries
    if (!potion || !mana) throw new Error('항목 없음')
    // 화면이 읽은 뒤 밖에서 마나 행을 고쳤다
    write('term,translation_en,memo\n물약,Potion,메모\n마나,MP,\n')
    const result = updateGlossary(
      dir,
      [
        { original: '물약', next: { ...potion, strict: true }, expected: potion },
        { original: '마나', next: { ...mana, note: '능력치' }, expected: mana }
      ],
      languages
    )
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.applied).toEqual(['물약'])
    expect(result.value.skipped).toEqual([{ term: '마나', reason: 'changed' }])
    const text = readFileSync(join(dir, GLOSSARY_FILE), 'utf8')
    expect(text).toContain('물약,Potion,,메모,,,true,')
    expect(text).toContain('마나,MP,,,,,,')
  })

  it('후보는 승인 대기로 붙고, 이미 있는 용어는 다시 넣지 않으며, 번역 프롬프트에는 들어가지 않는다', () => {
    write('term,translation_en\n물약,Potion\n')
    const first = appendGlossaryCandidates(
      dir,
      [
        { term: '마나', pos: '능력치', note: '', translations: { en: 'Mana' }, reason: '반복 등장', confidence: 0.9 },
        { term: '물약', pos: '', note: '', translations: { en: 'Potion' }, reason: '', confidence: 0.9 }
      ],
      languages
    )
    expect(first.ok && first.value).toEqual({ added: ['마나'], existing: ['물약'] })
    const again = appendGlossaryCandidates(dir, [{ term: ' 마나 ', pos: '', note: '', translations: {}, reason: '', confidence: 1 }], languages)
    expect(again.ok && again.value.added).toEqual([])
    const view = loadGlossary(dir, languages)
    expect(view.ok && view.value.entries.map((entry) => `${entry.term}:${entry.status}`)).toEqual(['물약:approved', '마나:pending'])
    const terms = loadGlossaryTerms(dir, 'en')
    expect(terms.ok && terms.value.map((term) => term.term)).toEqual(['물약'])
  })
})

describe('컨텍스트 제안', () => {
  const suggestion = (key: string, patch: Partial<ContextSuggestion> = {}): ContextSuggestion => ({
    key,
    source_hash: '',
    context: '',
    ui_type: '',
    max_len: '',
    vars: '',
    confidence: '0.9',
    note: '',
    ...patch
  })

  it('제안을 합쳐 쓰고, 적용하면 원문 메타데이터에 넣고 그 제안을 지운다(번역은 stale 이 되지 않는다)', () => {
    expect(saveMaster(dir, [master('a', '시작'), master('b', '{name} 획득')], false).ok).toBe(true)
    writeFileSync(
      translationPath(dir, 'en'),
      `key,text,source_hash,status\na,Start,${sourceHash('시작')},approved\n`
    )
    expect(writeContextSuggestions(dir, [suggestion('a', { context: '메뉴' }), suggestion('b', { context: '보상' })]).ok).toBe(true)
    expect(writeContextSuggestions(dir, [suggestion('a', { context: '메인 메뉴', ui_type: 'button' })]).ok).toBe(true)

    const loaded = loadContextSuggestions(dir)
    expect(loaded.ok && loaded.value.rows.map((row) => `${row.key}:${row.context}`)).toEqual(['a:메인 메뉴', 'b:보상'])

    const applied = applyContextSuggestions(dir, [
      { key: 'a', values: { context: '메인 메뉴', ui_type: 'button' }, expected: { context: '', ui_type: '' } }
    ])
    expect(applied.ok && applied.value).toEqual({ applied: ['a'], skipped: [] })

    forgetReadHashes()
    const rows = loadMaster(dir)
    expect(rows.ok && rows.value.rows[0]).toMatchObject({ key: 'a', source: '시작', context: '메인 메뉴', ui_type: 'button' })
    const after = loadContextSuggestions(dir)
    expect(after.ok && after.value.rows.map((row) => row.key)).toEqual(['b'])
    const translations = loadTranslations(dir, 'en')
    expect(translations.ok && translations.value.rows[0]?.status).toBe('approved')
  })

  it('버리기는 고른 키만 지운다', () => {
    expect(writeContextSuggestions(dir, [suggestion('a', { context: 'x' }), suggestion('b', { context: 'y' })]).ok).toBe(true)
    const removed = discardContextSuggestions(dir, ['b', 'zz'])
    expect(removed.ok && removed.value).toBe(1)
    const loaded = loadContextSuggestions(dir)
    expect(loaded.ok && loaded.value.rows.map((row) => row.key)).toEqual(['a'])
  })
})
