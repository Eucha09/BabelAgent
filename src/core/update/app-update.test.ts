import { describe, expect, it } from 'vitest'
import { describeUpdateError, downloadPercent } from './app-update'
import { ko } from '@shared/i18n/ko'

function coded(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}

describe('describeUpdateError', () => {
  it('네트워크 오류는 연결을 확인하라고 안내한다', () => {
    expect(describeUpdateError(new Error('net::ERR_INTERNET_DISCONNECTED'), 'check', ko).message).toContain('인터넷')
    expect(describeUpdateError(coded('getaddrinfo ENOTFOUND github.com', 'ENOTFOUND'), 'download', ko).message).toContain('인터넷')
  })

  it('릴리스를 찾지 못하면 그렇게 알린다', () => {
    const error = coded('No published versions on GitHub', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS')
    expect(describeUpdateError(error, 'check', ko).message).toContain('릴리스')
    expect(describeUpdateError(coded('404 Not Found', 'HTTP_ERROR_404'), 'check', ko).message).toContain('릴리스')
  })

  it('체크섬 불일치·파일 잠금·서버 오류를 구분한다', () => {
    expect(describeUpdateError(coded('sha512 checksum mismatch', 'ERR_CHECKSUM_MISMATCH'), 'download', ko).message).toContain('다시 받')
    expect(describeUpdateError(coded('EBUSY: resource busy', 'EBUSY'), 'download', ko).message).toContain('백신')
    expect(describeUpdateError(coded('502 Bad Gateway', 'HTTP_ERROR_502'), 'check', ko).message).toContain('GitHub')
  })

  it('모르는 오류는 단계에 맞는 문장을 쓰고 원래 메시지를 detail 에 남긴다', () => {
    expect(describeUpdateError(new Error('something odd'), 'check', ko)).toEqual({
      message: '업데이트를 확인하지 못했습니다.',
      detail: 'something odd'
    })
    expect(describeUpdateError('plain string', 'download', ko)).toEqual({
      message: '업데이트를 받지 못했습니다.',
      detail: 'plain string'
    })
  })

  it('detail 은 앞 여섯 줄만 남기고, 비었으면 null', () => {
    const long = Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\n')
    expect(describeUpdateError(new Error(long), 'check', ko).detail?.split('\n')).toHaveLength(6)
    expect(describeUpdateError(new Error(''), 'check', ko).detail).toBeNull()
  })
})

describe('downloadPercent', () => {
  it('0~100 정수로 자른다', () => {
    expect(downloadPercent(42.7, 0, 0)).toBe(42)
    expect(downloadPercent(-3, 0, 0)).toBe(0)
    expect(downloadPercent(100.4, 0, 0)).toBe(100)
  })

  it('percent 가 숫자가 아니면 바이트 수로 계산한다', () => {
    expect(downloadPercent(Number.NaN, 25, 100)).toBe(25)
    expect(downloadPercent(Number.NaN, 25, 0)).toBe(0)
  })
})
