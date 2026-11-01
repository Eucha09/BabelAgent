import { describe, expect, it } from 'vitest'
import { compareVersions, meetsVersion, parseClaudeVersion, pickClaudeExecutable, updateOutcome } from './claude'

describe('parseClaudeVersion', () => {
  it('출력에서 버전 숫자만 뽑는다', () => {
    expect(parseClaudeVersion('2.1.303 (Claude Code)\n')).toBe('2.1.303')
    expect(parseClaudeVersion('claude 10.0.1')).toBe('10.0.1')
    expect(parseClaudeVersion('command not found')).toBeNull()
  })
})

describe('compareVersions·meetsVersion', () => {
  it('자리마다 숫자로 비교한다', () => {
    expect(compareVersions('2.1.310', '2.1.303')).toBeGreaterThan(0)
    expect(compareVersions('2.1.9', '2.1.10')).toBeLessThan(0)
    expect(compareVersions('2.2.0', '2.1.999')).toBeGreaterThan(0)
    expect(compareVersions('2.1.303', '2.1.303')).toBe(0)
  })

  it('요구 버전 이상인지. 모르면 null', () => {
    expect(meetsVersion('2.1.303', '2.1.303')).toBe(true)
    expect(meetsVersion('2.1.263', '2.1.303')).toBe(false)
    expect(meetsVersion(null, '2.1.303')).toBeNull()
    expect(meetsVersion('2.1.303', null)).toBeNull()
  })
})

describe('pickClaudeExecutable', () => {
  const candidates = [
    { path: 'C:/me/.local/bin/claude.exe', source: 'native' as const },
    { path: 'C:/tools/claude.exe', source: 'path' as const },
    { path: 'C:/app/node_modules/sdk-win32-x64/claude.exe', source: 'bundled' as const }
  ]

  it('있는 첫 후보를 고른다', () => {
    expect(pickClaudeExecutable(candidates, (path) => path.includes('tools'))?.source).toBe('path')
    expect(pickClaudeExecutable(candidates, () => true)?.source).toBe('native')
    expect(pickClaudeExecutable(candidates, () => false)).toBeNull()
  })

  it('설정한 경로는 파일이 없어도 그것을 쓴다', () => {
    const withSetting = [{ path: 'D:/missing/claude.exe', source: 'setting' as const }, ...candidates]
    expect(pickClaudeExecutable(withSetting, () => false)).toEqual({ path: 'D:/missing/claude.exe', source: 'setting' })
  })
})

describe('updateOutcome', () => {
  it('앞뒤 버전과 종료 코드로 정한다', () => {
    expect(updateOutcome('2.1.303', '2.1.310', 0)).toBe('updated')
    expect(updateOutcome('2.1.310', '2.1.310', 0)).toBe('current')
    expect(updateOutcome('2.1.303', '2.1.303', 1)).toBe('failed')
    expect(updateOutcome('2.1.303', null, 0)).toBe('failed')
    expect(updateOutcome(null, '2.1.310', 0)).toBe('current')
  })
})
