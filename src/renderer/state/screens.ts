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
    description: 'project.json 의 게임 소개·톤 가이드·언어·스타일 규칙·배치 설정을 정하는 화면입니다.'
  },
  {
    id: 'strings',
    label: '원문',
    requiresProject: true,
    description: 'strings_master.csv의 원문을 가져오고 편집하는 화면입니다.'
  },
  {
    id: 'context',
    label: '컨텍스트',
    requiresProject: true,
    description: '에이전트가 원문의 컨텍스트·UI 유형·최대 길이·변수 설명을 제안하고, 고쳐서 승인하는 화면입니다.'
  },
  {
    id: 'glossary',
    label: '용어집',
    requiresProject: true,
    description: 'glossary.csv의 용어와 언어별 확정 번역을 관리하고, 에이전트가 찾은 용어 후보를 승인하는 화면입니다.'
  },
  {
    id: 'translate',
    label: '번역',
    requiresProject: true,
    description: '배치 번역을 실행하고 진행 상황을 보는 화면입니다.'
  },
  {
    id: 'review',
    label: '검토/QA',
    requiresProject: true,
    description: '번역을 검토하고 QA 진단을 확인하는 화면입니다.'
  },
  {
    id: 'export',
    label: '내보내기',
    requiresProject: true,
    description: 'Unity Localization용 CSV를 내보내는 화면입니다.'
  },
  {
    id: 'settings',
    label: '설정',
    requiresProject: false,
    description: 'Claude Code CLI 경로와 인증 방식을 설정합니다.'
  }
]

export function findScreen(id: ScreenId): ScreenDef {
  const screen = SCREENS.find((item) => item.id === id)
  if (!screen) throw new Error(`알 수 없는 화면: ${id}`)
  return screen
}
