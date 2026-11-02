import type { TranslateEffort, TranslateModel } from '@shared/schema/jobs'

/** 번역 화면과 프로젝트 화면이 같이 쓰는 선택지 */
export const MODEL_OPTIONS: readonly { value: TranslateModel; label: string }[] = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
  { value: 'default', label: '기본 (CLI 설정)' }
]

export const EFFORT_OPTIONS: readonly { value: TranslateEffort; label: string }[] = [
  { value: 'low', label: '낮음' },
  { value: 'medium', label: '중간' },
  { value: 'high', label: '높음' },
  { value: 'xhigh', label: '매우 높음' },
  { value: 'max', label: '최대' }
]

export const EFFORT_HINT =
  '높을수록 더 오래 생각하고 사용량을 더 씁니다. 모델이 지원하지 않는 수준은 그 모델이 지원하는 수준으로 낮춰 실행됩니다.'

export function modelLabel(model: TranslateModel): string {
  return MODEL_OPTIONS.find((item) => item.value === model)?.label ?? model
}

export function effortLabel(effort: TranslateEffort): string {
  return EFFORT_OPTIONS.find((item) => item.value === effort)?.label ?? effort
}
