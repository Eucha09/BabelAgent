import { describe, expect, it } from 'vitest'
import { fromRecords, parseCsvTable, stringifyCsvTable, toRecords } from './codec'

describe('CSV 왕복', () => {
  it('쉼표·따옴표·줄바꿈이 든 값이 그대로 돌아온다', () => {
    const values = [
      '쉼표, 들어감',
      '따옴표 "인용" 포함',
      '줄바꿈\n두 줄',
      '쉼표와 "따옴표", 줄바꿈\n까지',
      '  앞뒤 공백  ',
      '',
      '한글과 emoji 🙂',
      'a;b;c'
    ]
    const table = {
      header: ['key', 'source'],
      rows: values.map((value, index) => [`k${index}`, value])
    }

    const text = stringifyCsvTable(table)
    const back = parseCsvTable(text)

    expect(back.header).toEqual(table.header)
    expect(back.rows).toEqual(table.rows)
  })

  it('헤더만 있는 파일도 왕복한다', () => {
    const table = { header: ['key', 'source'], rows: [] }
    expect(parseCsvTable(stringifyCsvTable(table))).toEqual(table)
  })

  it('빈 텍스트는 빈 표', () => {
    expect(parseCsvTable('')).toEqual({ header: [], rows: [] })
  })

  it('CRLF로 저장된 파일도 읽는다', () => {
    const back = parseCsvTable('key,source\r\nk1,안녕\r\n')
    expect(back.rows).toEqual([['k1', '안녕']])
  })

  it('칸 수가 모자란 줄은 빈 문자열로 채운다', () => {
    const records = toRecords(parseCsvTable('key,source,context\nk1,안녕\n'))
    expect(records).toEqual([{ key: 'k1', source: '안녕', context: '' }])
  })
})

describe('레코드 변환', () => {
  it('열 순서를 지정한 대로 쓴다', () => {
    const table = fromRecords(['b', 'a'], [{ a: '1', b: '2' }])
    expect(table).toEqual({ header: ['b', 'a'], rows: [['2', '1']] })
  })

  it('없는 열은 빈 문자열', () => {
    expect(fromRecords(['a', 'z'], [{ a: '1' }]).rows).toEqual([['1', '']])
  })

  it('레코드 → 표 → 레코드 왕복', () => {
    const records = [{ key: 'k1', source: '쉼표, 포함' }]
    const back = toRecords(fromRecords(['key', 'source'], records))
    expect(back).toEqual(records)
  })
})
