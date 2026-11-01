import { describe, expect, it } from 'vitest'
import { describeAuthMethod } from './method'

describe('describeAuthMethod', () => {
  it('로그인하지 않았으면 none', () => {
    expect(describeAuthMethod(null).kind).toBe('none')
    expect(describeAuthMethod({ loggedIn: false }).kind).toBe('none')
  })

  it('구독 로그인은 구독 종류를 붙인다', () => {
    expect(describeAuthMethod({ loggedIn: true, apiProvider: 'firstParty', subscriptionType: 'pro' })).toEqual({
      kind: 'subscription',
      label: 'Claude 구독 (pro)'
    })
    expect(describeAuthMethod({ loggedIn: true }).label).toBe('Claude 구독')
  })

  it('Console 로그인은 authMethod 가 claude.ai 여도 apiKeySource 로 API 키로 본다', () => {
    expect(describeAuthMethod({ loggedIn: true, apiKeySource: '/login managed key', apiProvider: 'firstParty' })).toEqual({
      kind: 'api-key',
      label: 'API 키 (Console 로그인)'
    })
  })

  it('환경 변수와 모르는 출처도 API 키로 보고, 모르는 출처는 그대로 보여 준다', () => {
    expect(describeAuthMethod({ loggedIn: true, apiKeySource: 'ANTHROPIC_API_KEY' }).label).toBe('API 키 (환경 변수 ANTHROPIC_API_KEY)')
    expect(describeAuthMethod({ loggedIn: true, apiKeySource: 'someNewSource' }).label).toBe('API 키 (someNewSource)')
  })

  it('클라우드 제공자는 따로 가린다', () => {
    expect(describeAuthMethod({ loggedIn: true, apiProvider: 'bedrock' })).toEqual({ kind: 'provider', label: '클라우드 제공자 (bedrock)' })
  })
})
