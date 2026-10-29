import { describe, expect, it } from 'vitest'
import type { ExportRequest } from '@shared/schema/export'
import { createDefaultProjectConfig, type ProjectConfig } from '@shared/schema/project'
import type { MasterRow, TranslationRow } from '@shared/schema/strings'
import { sourceHash } from '../hash'
import { exportLanguages, glyphsByLanguage, planExport, smartTable, type ExportPlanInput } from './plan'

const base = createDefaultProjectConfig({ name: 'My Game', sourceLanguage: 'ko', targetLanguages: ['en', 'ja'], schemaVersion: 1 })

const master = (key: string, source: string, smart = ''): MasterRow => ({
  key,
  source,
  context: `${key} 설명`,
  ui_type: '',
  max_len: '',
  vars: '',
  smart,
  tags: '',
  source_hash: sourceHash(source)
})

const done = (row: MasterRow, text: string): TranslationRow => ({
  key: row.key,
  text,
  source_hash: row.source_hash,
  status: 'approved',
  confidence: '',
  note: '',
  source_snapshot: row.source
})

const rows = [master('a', '{0}개', 'true'), master('b', '{name}님'), master('c', '닫기')]

const request = (extra: Partial<ExportRequest> = {}): ExportRequest => ({
  languages: ['ko', 'en', 'ja'],
  sharedComments: false,
  localeComments: false,
  missing: 'empty',
  glyphs: false,
  fileName: '',
  ...extra
})

const input = (extra: Partial<ExportPlanInput> = {}, config: ProjectConfig = base): ExportPlanInput => ({
  config,
  request: request(),
  master: rows,
  translations: new Map([['en', new Map(rows.map((row) => [row.key, done(row, `en ${row.key}`)]))]]),
  unity: { state: 'none' },
  template: { state: 'none' },
  ...extra
})

describe('exportLanguages', () => {
  it('프로젝트 언어 순서로 맞추고 모르는 코드는 뺀다', () => {
    expect(exportLanguages(base, ['ja', 'fr', 'ko'])).toEqual(['ko', 'ja'])
  })
})

describe('planExport', () => {
  it('템플릿·Unity 없이 자동 생성한다', () => {
    const plan = planExport(input())
    expect(plan.headerSource).toBe('auto')
    expect(plan.columns.map((column) => column.name)).toEqual(['Key', 'Id', 'Korean(ko)', 'English(en)', 'Japanese(ja)'])
    expect(plan.problems).toEqual([])
    expect(plan.build.rows[0]).toEqual(['a', '', '{0}개', 'en a', ''])
    expect(plan.baseName).toBe('My Game')
    expect(plan.files).toEqual(['My Game.csv', 'My Game_smart.csv'])
  })

  it('Smart 항목은 smart=true 행, 구문은 있는데 미정인 행은 따로 센다', () => {
    const plan = planExport(input())
    expect(plan.smart).toEqual([{ key: 'a', id: '', source: '{0}개' }])
    expect(plan.smartUnset).toBe(1)
    expect(smartTable(plan.smart)).toEqual({ header: ['Key', 'Id'], rows: [['a', '']] })
  })

  it('언어를 고르지 않으면 막는다', () => {
    expect(planExport(input({ request: request({ languages: [] }) })).problems).toContain('내보낼 언어를 고르세요.')
  })

  it('Unity 를 연결하면 로케일 코드와 Id 를 쓰고 파일 이름은 컬렉션 이름', () => {
    const plan = planExport(
      input({
        unity: {
          state: 'ok',
          projectPath: '../Game',
          locales: [
            { code: 'ko-KR', name: 'Korean (South Korea) (ko-KR)' },
            { code: 'en', name: 'English (en)' }
          ],
          tables: [{ collection: 'UI', entries: [{ id: '9223372036854775807', key: 'a' }, { id: '7', key: 'gone' }] }],
          notices: []
        }
      })
    )
    expect(plan.columns.map((column) => column.name)).toEqual(['Key', 'Id', 'Korean (South Korea)(ko-KR)', 'English(en)', 'Japanese(ja)'])
    expect(plan.build.rows[0]?.[1]).toBe('9223372036854775807')
    expect(plan.smart[0]?.id).toBe('9223372036854775807')
    expect(plan.unity).toMatchObject({ state: 'ok', tableCollection: 'UI', idFound: 1, newKeys: 2, unityOnlyKeys: 1 })
    expect(plan.warnings.some((warning) => warning.includes('ja'))).toBe(true)
    expect(plan.baseName).toBe('UI')
  })

  it('Unity 를 읽지 못하면 자동 생성으로 대신하고 알린다', () => {
    const plan = planExport(input({ unity: { state: 'failed', projectPath: '../Game', reason: 'Assets 폴더가 없습니다.' } }))
    expect(plan.columns.map((column) => column.name)).toEqual(['Key', 'Id', 'Korean(ko)', 'English(en)', 'Japanese(ja)'])
    expect(plan.warnings[0]).toContain('Assets 폴더가 없습니다.')
    expect(plan.problems).toEqual([])
  })

  it('컬렉션이 여럿인데 고르지 않았으면 Id 를 비우고 알린다', () => {
    const plan = planExport(
      input({
        unity: {
          state: 'ok',
          projectPath: '../Game',
          locales: [],
          tables: [
            { collection: 'UI', entries: [{ id: '1', key: 'a' }] },
            { collection: 'Dialog', entries: [] }
          ],
          notices: []
        }
      })
    )
    expect(plan.build.rows[0]?.[1]).toBe('')
    expect(plan.unity.state === 'ok' && plan.unity.notices.length).toBe(1)
  })

  it('템플릿이 있으면 그 순서와 이름을 따르고, 저장된 매핑이 다르면 다시 추론한다', () => {
    const config: ProjectConfig = {
      ...base,
      export: { ...base.export, template: { path: 'templates/unity_template.csv', columns: [{ name: 'Old', role: 'key', language: '' }] } }
    }
    const plan = planExport(
      input({ template: { state: 'ok', path: 'templates/unity_template.csv', header: ['English(en)', 'Key', 'Memo'] } }, config)
    )
    expect(plan.headerSource).toBe('template')
    expect(plan.columns.map((column) => column.name)).toEqual(['English(en)', 'Key'])
    expect(plan.template).toMatchObject({ state: 'ok', reinferred: true })
    expect(plan.warnings.some((warning) => warning.includes('Memo'))).toBe(true)
    expect(plan.warnings).toContain('템플릿에 값 열이 없어 내보내지 않는 언어: ko, ja')
    expect(plan.build.rows[0]).toEqual(['en a', 'a'])
  })

  it('템플릿을 읽지 못하면 자동 생성 헤더를 쓴다', () => {
    const plan = planExport(input({ template: { state: 'failed', path: 'templates/x.csv', reason: '파일이 없습니다.' } }))
    expect(plan.headerSource).toBe('auto')
    expect(plan.warnings[0]).toContain('파일이 없습니다.')
  })

  it('글자 목록 옵션이면 값 열 언어마다 파일을 더한다', () => {
    const plan = planExport(input({ request: request({ glyphs: true, languages: ['ko', 'en'], fileName: 'out' }) }))
    expect(plan.files).toEqual(['out.csv', 'out_smart.csv', 'out_chars_ko.txt', 'out_chars_en.txt'])
    const glyphs = glyphsByLanguage(plan, base.smartStrings)
    expect(glyphs.get('ko')).toBe('개기님닫')
    expect(glyphs.get('en')).toBe(' abcen')
  })
})
