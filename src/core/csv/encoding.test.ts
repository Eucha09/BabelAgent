import { describe, expect, it } from 'vitest'
import { looksMisdecoded, stripBom } from './encoding'

describe('looksMisdecoded', () => {
  it('정상 UTF-8 문자열은 통과', () => {
    expect(looksMisdecoded('키,원문\n인사,안녕하세요')).toBe(false)
  })

  it('CP949 바이트를 UTF-8로 읽으면 치환 문자가 생긴다', () => {
    const cp949Bytes = new Uint8Array([0xbe, 0xc8, 0xb3, 0xe7]) // "안녕"
    const decoded = new TextDecoder('utf-8').decode(cp949Bytes)
    expect(looksMisdecoded(decoded)).toBe(true)
  })

  it('빈 문자열은 깨진 것이 아니다', () => {
    expect(looksMisdecoded('')).toBe(false)
  })
})

describe('stripBom', () => {
  it('BOM이 있으면 뗀다', () => {
    expect(stripBom('﻿key,source')).toBe('key,source')
  })

  it('BOM이 없으면 그대로', () => {
    expect(stripBom('key,source')).toBe('key,source')
  })
})
