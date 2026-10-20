import { createHash } from 'node:crypto'

/**
 * 원문 해시. 원문 텍스트만 대상으로 하고 줄바꿈만 통일한다.
 * 공백 trim이나 유니코드 정규화는 하지 않는다 — 원문의 공백 차이는 실제 차이다.
 */
export function sourceHash(source: string): string {
  const normalized = source.split('\r\n').join('\n')
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16)
}

/** 파일 내용 해시. 충돌 감지용이라 바이트 그대로 본다. */
export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
