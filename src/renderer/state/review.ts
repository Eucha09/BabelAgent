import type { QuickFilter } from '@core/review/filter'
import type { QaRuleId } from '@shared/schema/qa'
import type { BulkApproveSkipReason } from '@shared/schema/review'

/** 진단 종류 선택 목록과 진단 줄에 붙는 이름 */
export const RULE_LABEL: Record<QaRuleId, string> = {
  'var.missing': '변수 누락',
  'var.extra': '변수 추가됨',
  'var.meta_mismatch': 'vars 열 불일치',
  'var.meta_invalid': 'vars 열 읽기 실패',
  'smart.brace_unbalanced': '중괄호 짝',
  'smart.unknown_formatter': '모르는 포매터',
  'tag.set_mismatch': '태그 불일치',
  'tag.unclosed': '태그 짝',
  'len.over_max': '길이 초과',
  'text.empty': '빈 번역',
  'glossary.violation': '용어집',
  'glossary.violation_strict': '용어집(strict)',
  'status.stale': '원문 변경'
}

/** 일괄 승인에서 건너뛴 이유 */
export const BULK_SKIP_LABEL: Record<BulkApproveSkipReason, string> = {
  'not-draft': '초안이 아님',
  empty: '빈 번역',
  'has-diagnostics': 'QA 진단 있음',
  'low-confidence': '신뢰도 낮음',
  changed: '그 사이 바뀜',
  missing: '키 없음'
}

export const QUICK_LABEL: Record<QuickFilter, { label: string; hint: string }> = {
  all: { label: '전체', hint: '모든 행' },
  'needs-review': { label: '검토 필요', hint: '번역은 있고 아직 승인하지 않은 행(초안·검토)' },
  'low-confidence': { label: '신뢰도 낮음', hint: '에이전트 신뢰도가 기준보다 낮은 승인 전 행' },
  'qa-error': { label: 'QA 오류', hint: '오류 진단이 있는 행. 내보내기를 막는다' },
  stale: { label: '원문 변경', hint: '번역한 뒤 원문이 바뀐 행(stale)' }
}
