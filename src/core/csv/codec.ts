import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { stripBom } from './encoding'

export type CsvTable = {
  header: string[]
  rows: string[][]
}

/**
 * CSV 텍스트를 표로 읽는다. 첫 줄을 헤더로 본다.
 * 직접 자르지 않고 표준 파서에 맡긴다 — 따옴표 안의 쉼표·줄바꿈 때문이다.
 */
export function parseCsvTable(text: string): CsvTable {
  const records = parse(stripBom(text), {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true
  }) as string[][]

  const [header, ...rows] = records
  if (!header) return { header: [], rows: [] }
  return { header, rows }
}

/** 표를 CSV 텍스트로 쓴다. 줄바꿈은 LF, 따옴표는 필요한 값에만 붙는다. */
export function stringifyCsvTable(table: CsvTable): string {
  return stringify([table.header, ...table.rows], { record_delimiter: '\n' })
}

/** 표를 열 이름 기준 레코드로 바꾼다. 없는 칸은 빈 문자열로 채운다. */
export function toRecords(table: CsvTable): Record<string, string>[] {
  return table.rows.map((row) => {
    const record: Record<string, string> = {}
    table.header.forEach((name, index) => {
      record[name] = row[index] ?? ''
    })
    return record
  })
}

/** 지정한 열 순서로 레코드를 표로 바꾼다. */
export function fromRecords(
  header: readonly string[],
  records: readonly Record<string, string>[]
): CsvTable {
  return {
    header: [...header],
    rows: records.map((record) => header.map((name) => record[name] ?? ''))
  }
}
