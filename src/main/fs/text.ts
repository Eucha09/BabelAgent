import { existsSync, readFileSync } from 'node:fs'
import iconv from 'iconv-lite'
import { looksMisdecoded, stripBom } from '@core/csv/encoding'
import { contentHash } from '@core/hash'
import { writeFileAtomicSync } from './index'

export type TextEncoding = 'utf8' | 'cp949'

export type TextFile = {
  text: string
  encoding: TextEncoding
  /** 읽은 시점의 파일 내용 해시. 충돌 감지의 기준이 된다. */
  hash: string
}

/**
 * UTF-8로 먼저 읽고, 깨졌으면 CP949로 다시 읽는다.
 * 저장은 언제나 UTF-8이므로 CP949로 읽었다는 사실을 호출자에게 알려야 한다.
 */
export function readTextFile(path: string): TextFile {
  const buffer = readFileSync(path)
  const hash = contentHash(buffer)
  const utf8 = buffer.toString('utf8')
  if (!looksMisdecoded(utf8)) return { text: stripBom(utf8), encoding: 'utf8', hash }
  return { text: iconv.decode(buffer, 'cp949'), encoding: 'cp949', hash }
}

/** UTF-8로 원자적으로 쓰고 새 내용 해시를 돌려준다. */
export function writeTextFile(path: string, text: string): string {
  writeFileAtomicSync(path, text)
  return contentHash(Buffer.from(text, 'utf8'))
}

/** 디스크의 현재 내용 해시. 파일이 없으면 null. */
export function diskHash(path: string): string | null {
  if (!existsSync(path)) return null
  return contentHash(readFileSync(path))
}
