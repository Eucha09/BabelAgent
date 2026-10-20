export type ScreenId = 'strings' | 'glossary' | 'translate' | 'review' | 'export' | 'settings'

export type ScreenDef = {
  id: ScreenId
  label: string
  /** 사이드바 상태 배지. M1에서는 구현 예정 마일스톤을 보여준다. */
  badge: string
  badgeTone: 'default' | 'ready'
  requiresProject: boolean
  description: string
  /** 플레이스홀더 화면에 보여줄 예정 작업. */
  planned: string[]
}

export const SCREENS: readonly ScreenDef[] = [
  {
    id: 'strings',
    label: '원문',
    badge: '사용 가능',
    badgeTone: 'ready',
    requiresProject: true,
    description: 'strings_master.csv의 원문을 가져오고 편집하는 화면입니다.',
    planned: ['CSV 가져오기와 열 매핑', '그리드 표시(가상 스크롤)', '원문 해시 계산과 stale 표시']
  },
  {
    id: 'glossary',
    label: '용어집',
    badge: 'M5',
    badgeTone: 'default',
    requiresProject: true,
    description: 'glossary.csv의 용어와 언어별 확정 번역을 관리하는 화면입니다.',
    planned: ['용어 편집과 strict 토글', '에이전트 용어 추출 결과 승인', '컨텍스트 추정']
  },
  {
    id: 'translate',
    label: '번역',
    badge: 'M3',
    badgeTone: 'default',
    requiresProject: true,
    description: '배치 번역을 실행하고 진행 상황을 보는 화면입니다.',
    planned: ['커스텀 MCP 도구', '배치 산정(30행 / 3,000자)', '작업자 2개 동시 실행', '사용량 한도 대기와 재개']
  },
  {
    id: 'review',
    label: '검토/QA',
    badge: 'M4',
    badgeTone: 'default',
    requiresProject: true,
    description: '번역을 검토하고 QA 진단을 확인하는 화면입니다.',
    planned: ['Smart Strings 토크나이저', '변수·태그·용어집 검사', '인라인 편집과 상태 전환', '행 단위 리롤']
  },
  {
    id: 'export',
    label: '내보내기',
    badge: 'M6',
    badgeTone: 'default',
    requiresProject: true,
    description: 'Unity Localization용 CSV를 내보내는 화면입니다.',
    planned: ['템플릿 헤더 해석과 열 매핑', '미번역 처리 옵션', 'QA 오류 시 내보내기 차단']
  },
  {
    id: 'settings',
    label: '설정',
    badge: '사용 가능',
    badgeTone: 'ready',
    requiresProject: false,
    description: 'Claude Code CLI 경로와 인증 방식을 설정합니다.',
    planned: []
  }
]

export function findScreen(id: ScreenId): ScreenDef {
  const screen = SCREENS.find((item) => item.id === id)
  if (!screen) throw new Error(`알 수 없는 화면: ${id}`)
  return screen
}
