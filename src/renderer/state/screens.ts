export type ScreenId = 'project' | 'strings' | 'context' | 'glossary' | 'translate' | 'review' | 'export' | 'settings'

/** 사이드바 단계. 이름과 설명은 문구 카탈로그의 `screens[id]`에 있다 */
export type ScreenDef = {
  id: ScreenId
  requiresProject: boolean
}

export const SCREENS: readonly ScreenDef[] = [
  { id: 'project', requiresProject: true },
  { id: 'strings', requiresProject: true },
  { id: 'context', requiresProject: true },
  { id: 'glossary', requiresProject: true },
  { id: 'translate', requiresProject: true },
  { id: 'review', requiresProject: true },
  { id: 'export', requiresProject: true },
  { id: 'settings', requiresProject: false }
]
