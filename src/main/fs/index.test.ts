import { describe, expect, it } from 'vitest'
import { describeIoError } from './index'

describe('describeIoError', () => {
  it('파일 잠금(EBUSY)은 다른 프로그램을 의심하라고 안내한다', () => {
    const message = describeIoError({ code: 'EBUSY' }, 'strings_master.csv')
    expect(message).toContain('strings_master.csv')
    expect(message).toContain('엑셀')
  })

  it('EPERM도 같은 안내', () => {
    expect(describeIoError({ code: 'EPERM' }, 'a.csv')).toContain('잠겨')
  })

  it('권한 오류', () => {
    expect(describeIoError({ code: 'EACCES' }, 'a.csv')).toContain('권한')
  })

  it('없는 파일', () => {
    expect(describeIoError({ code: 'ENOENT' }, 'a.csv')).toContain('찾을 수 없습니다')
  })

  it('디스크 부족', () => {
    expect(describeIoError({ code: 'ENOSPC' }, 'a.csv')).toContain('디스크 공간')
  })

  it('모르는 오류는 원문 메시지를 붙인다', () => {
    const message = describeIoError(new Error('이상한 오류'), 'a.csv')
    expect(message).toContain('이상한 오류')
  })
})
