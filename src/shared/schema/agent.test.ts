import { describe, expect, it } from 'vitest'
import { AuthStatusJson } from './agent'

describe('AuthStatusJson', () => {
  it('구독 로그인 출력을 읽는다', () => {
    const parsed = AuthStatusJson.parse({
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      email: 'user@example.com',
      orgName: 'Org',
      subscriptionType: 'pro'
    })
    expect(parsed).toMatchObject({ loggedIn: true, subscriptionType: 'pro' })
    expect(parsed.apiKeySource).toBeUndefined()
  })

  it('Console(API 과금) 로그인의 null 필드와 apiKeySource 를 받는다', () => {
    // Claude Code 2.1 의 실제 출력 모양(값은 바꿈). 모르는 필드는 버린다
    const parsed = AuthStatusJson.parse({
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      analyticsDisabled: false,
      projectsDirectory: 'C:\Users\me\.claude\projects',
      apiKeySource: '/login managed key',
      email: 'user@example.com',
      orgId: '00000000-0000-0000-0000-000000000000',
      orgName: 'Individual Org',
      subscriptionType: null
    })
    expect(parsed.subscriptionType).toBeUndefined()
    expect(parsed.apiKeySource).toBe('/login managed key')
  })

  it('로그아웃 상태는 loggedIn 만 있어도 된다', () => {
    expect(AuthStatusJson.parse({ loggedIn: false })).toMatchObject({ loggedIn: false })
  })
})
