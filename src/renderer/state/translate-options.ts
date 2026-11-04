import type { TranslateEffort, TranslateModel } from '@shared/schema/jobs'

/** 번역 화면과 프로젝트 화면의 모델 선택지 순서. 이름은 카탈로그 `translateOptions.model` */
export const MODEL_VALUES: readonly TranslateModel[] = ['opus', 'sonnet', 'haiku', 'default']

/** 사고 수준 선택지 순서. 이름은 카탈로그 `translateOptions.effort` */
export const EFFORT_VALUES: readonly TranslateEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
