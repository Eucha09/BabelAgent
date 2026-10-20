/**
 * Smart Strings 포매터 기본 허용 목록. 프로젝트의 smartStrings.formatters가 비어 있을 때만 쓴다.
 * 자세한 규칙은 docs/qa-rules.md.
 */
export const DEFAULT_SMART_FORMATTERS: readonly string[] = [
  // Localization 패키지 1.x에서 확인된 이름
  'substr',
  'template',
  't',
  'plural',
  'p',
  // 확인 대기 — Unity 쪽에서 확정한 뒤 이 주석을 지운다
  'choose',
  'cond',
  'conditional',
  'd',
  'default',
  'ismatch',
  'list',
  'l',
  'time',
  'xelement',
  'isnull'
]
