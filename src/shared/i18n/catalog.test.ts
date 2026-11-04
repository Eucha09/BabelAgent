import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en } from './en'
import { ko } from './ko'

const HANGUL = /[가-힣ㄱ-ㆎ]/

/** 카탈로그의 모든 값을 경로와 함께 늘어놓는다. 함수 값은 소스 글자로 본다(템플릿 문자열이 그 안에 있다) */
function entries(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (typeof value === 'function') return [[path, String(value)]]
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => entries(child, path ? `${path}.${key}` : key))
  }
  return [[path, String(value)]]
}

function shape(value: unknown): unknown {
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)]))
  }
  return typeof value
}

/**
 * 주석을 뺀 소스. 블록·줄 주석과 JSX 주석을 지운다. URL 의 `//` 뒤도 같이 지워지지만, 한글을 놓치는 쪽이 아니라
 * 덜 보는 쪽이라 괜찮다.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/** 폴더 안의 소스 파일(테스트 제외). 저장소 기준 경로 */
function sources(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.ts$/.test(file))
    .map((file) => `${dir}/${file.replace(/\\/g, '/')}`)
}

/** 한글이 코드에 있어야 하는 파일 */
const HANGUL_ALLOWED = [
  // 한국어 카탈로그
  'src/shared/i18n/ko.ts',
  // 언어 선택지 이름 "한국어"
  'src/shared/i18n/languages.ts',
  // 가져오는 CSV 의 한국어 열 머리 별칭(키·원문 등). 화면 문구가 아니라 입력을 알아보는 값이다
  'src/core/strings/import.ts'
]

/** 코드에 화면 문구를 직접 쓰지 않는 파일(주석은 한국어로 쓴다). 문구는 카탈로그에만 둔다 */
const MIGRATED = sources('src').filter((file) => !HANGUL_ALLOWED.includes(file))

describe('문구 카탈로그', () => {
  it('영어 카탈로그는 한국어와 모양(키와 값의 종류)이 같다', () => {
    expect(shape(en)).toEqual(shape(ko))
  })

  it('영어 카탈로그에 한글이 없다', () => {
    const leaked = entries(en).filter(([, text]) => HANGUL.test(text))
    expect(leaked).toEqual([])
  })

  // 문장 가운데에 링크·코드가 들어가는 조각(…Before/…After)은 어순에 따라 한쪽 언어에서 비어도 된다
  it('빈 문구가 없다', () => {
    for (const catalog of [ko, en]) {
      expect(entries(catalog).filter(([path, text]) => text.trim() === '' && !/(Before|After)$/.test(path))).toEqual([])
    }
  })

  it.each(MIGRATED)('카탈로그로 옮긴 파일의 코드에 한글이 없다: %s', (file) => {
    const source = stripComments(readFileSync(join(process.cwd(), file), 'utf8'))
    const lines = source.split('\n').filter((line) => HANGUL.test(line))
    expect(lines).toEqual([])
  })
})
