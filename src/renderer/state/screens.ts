export type ScreenId = 'project' | 'strings' | 'context' | 'glossary' | 'translate' | 'review' | 'export' | 'settings'

export type ScreenDef = {
  id: ScreenId
  label: string
  requiresProject: boolean
  /** 사이드바 항목에 마우스를 올리면 보이는 설명 */
  description: string
}

export const SCREENS: readonly ScreenDef[] = [
  {
    id: 'project',
    label: '프로젝트',
    requiresProject: true,
    description: '언어·게임 소개·톤 가이드·스타일 규칙·번역 설정'
  },
  {
    id: 'strings',
    label: '원문',
    requiresProject: true,
    description: '원문 가져오기와 편집'
  },
  {
    id: 'context',
    label: '컨텍스트',
    requiresProject: true,
    description: '컨텍스트·UI 유형·최대 길이·변수 설명 제안과 적용'
  },
  {
    id: 'glossary',
    label: '용어집',
    requiresProject: true,
    description: '용어 추출·번역·승인'
  },
  {
    id: 'translate',
    label: '번역',
    requiresProject: true,
    description: '배치 번역 실행'
  },
  {
    id: 'review',
    label: '검토/QA',
    requiresProject: true,
    description: '번역 검토와 QA 진단'
  },
  {
    id: 'export',
    label: '내보내기',
    requiresProject: true,
    description: 'Unity Localization CSV 내보내기'
  },
  {
    id: 'settings',
    label: '설정',
    requiresProject: false,
    description: '계정·Claude Code·앱 업데이트'
  }
]

export function findScreen(id: ScreenId): ScreenDef {
  const screen = SCREENS.find((item) => item.id === id)
  if (!screen) throw new Error(`알 수 없는 화면: ${id}`)
  return screen
}
