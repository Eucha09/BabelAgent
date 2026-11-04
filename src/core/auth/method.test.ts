import { describe, expect, it } from 'vitest'
import { en } from '@shared/i18n/en'
import { ko } from '@shared/i18n/ko'
import { authMethodKind, describeAuthMethod } from './method'

describe('describeAuthMethod', () => {
  it('로그인하지 않았으면 none', () => {
    expect(describeAuthMethod(null, ko).kind).toBe('none')
    expect(describeAuthMethod({ loggedIn: false }, ko).kind).toBe('none')
  })

  it('구독 로그인은 구독 종류를 붙인다', () => {
    expect(describeAuthMethod({ loggedIn: true, apiProvider: 'firstParty', subscriptionType: 'pro' }, ko)).toEqual({
      kind: 'subscription',
      label: 'Claude 구독 (pro)'
    })
    expect(describeAuthMethod({ loggedIn: true }, ko).label).toBe('Claude 구독')
  })

  it('Console 로그인은 authMethod 가 claude.ai 여도 apiKeySource 로 API 키로 본다', () => {
    expect(describeAuthMethod({ loggedIn: true, apiKeySource: '/login managed key', apiProvider: 'firstParty' }, ko)).toEqual({
      kind: 'api-key',
      label: 'API 키 (Console 로그인)'
    })
  })

  it('환경 변수와 모르는 출처도 API 키로 보고, 모르는 출처는 그대로 보여 준다', () => {
    expect(describeAuthMethod({ loggedIn: true, apiKeySource: 'ANTHROPIC_API_KEY' }, ko).label).toBe('API 키 (환경 변수 ANTHROPIC_API_KEY)')
    expect(describeAuthMethod({ loggedIn: true, apiKeySource: 'someNewSource' }, ko).label).toBe('API 키 (someNewSource)')
  })

  it('클라우드 제공자는 따로 가린다', () => {
    expect(describeAuthMethod({ loggedIn: true, apiProvider: 'bedrock' }, ko)).toEqual({ kind: 'provider', label: '클라우드 제공자 (bedrock)' })
  })

  it('화면 언어의 카탈로그로 이름을 만든다', () => {
    expect(describeAuthMethod({ loggedIn: true, apiKeySource: 'ANTHROPIC_API_KEY' }, en).label).toBe(
      'API key (ANTHROPIC_API_KEY environment variable)'
    )
    expect(describeAuthMethod({ loggedIn: true, subscriptionType: 'max' }, en).label).toBe('Claude subscription (max)')
    expect(describeAuthMethod(null, en).label).toBe('Not logged in')
  })

  it('종류만 볼 때는 문구 없이 가린다', () => {
    expect(authMethodKind(null)).toBe('none')
    expect(authMethodKind({ loggedIn: true, apiKeySource: '/login managed key' })).toBe('api-key')
    expect(authMethodKind({ loggedIn: true, apiProvider: 'vertex' })).toBe('provider')
    expect(authMethodKind({ loggedIn: true, apiProvider: 'firstParty' })).toBe('subscription')
  })
})
