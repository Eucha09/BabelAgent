# 에이전트 프롬프트와 배치

## 세션 수명

| 작업 | 세션 | 재사용 |
|---|---|---|
| 배치 번역 | 배치마다 새 `query()` | × |
| 컨텍스트 추정 | 배치마다 새 `query()` | × |
| 용어 추출 | 배치마다 새 `query()` | × |
| 행 단위 리롤 | 일회성 `query()` | × |
| 에이전트 패널 채팅 | `resume` 유지 | ○ |

배치 세션을 재사용하지 않는 이유: 앞 배치의 결정이 뒤 배치에 암묵적으로 번지면 결과를 재현할 수 없고, 실패한 배치만 다시 돌릴 수도 없다.

## 공통 옵션

```ts
query({
  prompt,
  options: {
    settingSources: [],              // 사용자 PC 설정과 이 저장소의 CLAUDE.md 차단
    cwd: projectDir,
    allowedTools: [/* MCP 도구만 */],
    disallowedTools: ['Bash', 'Write', 'Edit'],
    mcpServers: { babel: babelMcpServer },
    pathToClaudeCodeExecutable: appSettings.cliPath ?? undefined,
  },
})
```

## 프롬프트 조립 순서

고정 부분 → 가변 부분. 고정 부분은 프로젝트 설정이 바뀌지 않는 한 **문자 단위로 동일**해야 한다(프롬프트 캐싱).

1. 역할과 출력 규약 — 상수 문자열
2. 게임 소개 (`game.intro`)
3. 톤 가이드 (`game.toneGuide`)
4. 스타일 규칙 (`styleRules`, `id` 순 정렬)
5. 언어 지시 — `sourceLanguage` → 대상 언어
6. ── 여기까지 고정 ──
7. 이번 배치에 등장하는 용어집 항목만
8. 이번 배치 문자열(키, 원문, context, ui_type, max_len, vars)

금지:

- 고정 부분에 타임스탬프, 배치 번호, 진행률, 난수를 넣지 않는다.
- `styleRules`를 삽입 순서대로 넣지 않는다. 정렬해서 넣어야 추가·삭제 시 앞부분이 유지된다.
- 전체 용어집을 매번 넣지 않는다. 배치 문자열에 등장하는 항목만 필터링한다(`get_glossary_terms`).

## 배치 산정

```
배치에 행을 하나씩 담다가 다음 중 먼저 걸리는 쪽에서 끊는다
  · 행 수 >= batch.maxRows        (기본 30)
  · 원문 누적 문자 수 >= batch.maxSourceChars  (기본 3000)
단, 한 행이 혼자 maxSourceChars를 넘으면 그 행만으로 배치를 만든다
```

- 정렬은 key 순. 같은 화면/태그의 문자열이 같은 배치에 모이면 문맥이 좋아지므로, `tags` 기준 그룹 정렬은 후순위 개선 과제로 둔다.
- 동시 실행은 `batch.concurrency`(기본 2, 상한 3). 코드에서 `Math.min(value, 3)`으로 잘라낸다.

## 응답 규약

에이전트는 다른 설명 없이 JSON 배열만 출력한다.

```ts
const TranslationItem = z.object({
  key: z.string().min(1),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  note: z.string().default(''),
});
const TranslationResponse = z.array(TranslationItem);
```

검증 순서:

1. JSON 파싱 → 실패 시 배치 실패
2. zod `parse` → 실패 시 배치 실패
3. 키 집합 일치 확인(누락·초과·중복) → 불일치 시 배치 실패
4. 행별 QA 오류 검사 → 오류가 하나라도 있으면 배치 실패
5. 전부 통과 → 배치 전체를 원자적으로 기록, 상태 `draft`

배치 실패 시 해당 행들은 미완료로 남고, 실패 사유(파싱/키 불일치/QA 오류 + 행별 진단)를 작업 결과에 모아 사용자에게 보여준다. 자동 재시도는 하지 않는다.

## 작업별 프롬프트

### 번역

- 출력: `TranslationResponse`
- 지시 요점: 변수와 태그를 원문과 동일한 집합으로 유지, `max_len` 준수, 용어집의 확정 번역 사용, 불확실하면 `confidence`를 낮추고 `note`에 이유.
- `approved` 행은 애초에 배치에 넣지 않는다.

### 컨텍스트 추정

- 입력: `context`가 빈 행
- 출력: `{ key, context, confidence, note }[]`
- 추정값은 `context` 열에 쓰되 `confidence`가 낮은 항목은 그리드에서 구분 표시한다. 번역 상태에는 영향을 주지 않는다.

### 용어 추출

- 출력: `{ term, pos, reason, confidence }[]`
- 결과는 `glossary.csv`에 `status: pending`으로 들어간다. 사용자가 승인해야 `approved`가 되고, 승인된 항목만 번역 프롬프트에 들어간다.

### 행 단위 리롤

- 해당 행 하나 + 고정 부분 + 사용자가 입력한 추가 지시로 일회성 세션을 돌린다.
- 결과는 기존 번역을 대체하지 않고 후보로 제시한다. 적용은 사용자가 결정한다.

## 사용량 한도 처리

- 한도 오류를 받으면 모든 작업자를 멈추고 작업 상태를 `waiting-limit`으로 바꾼다. 진행 중이던 배치는 기록하지 않는다.
- 응답에 재설정 시각이 있으면 그 시각까지 대기한다. 없으면 1 → 2 → 5 → 10분 백오프.
- 10분 백오프 이후에도 실패하면 자동 재시도를 멈추고 사용자 조작을 기다린다.
- UI는 남은 대기 시간과 "지금 재시도" 버튼을 보여준다.
- 대기 중에도 이미 기록된 결과는 그대로 유지된다. 재개는 미완료 행 재계산으로 이뤄진다.

## 에이전트 패널

- 유일하게 `resume`으로 이어지는 세션. 사용자가 프로젝트를 닫으면 세션 ID를 버린다.
- 사용자가 "앞으로 ~하게 해줘"라고 지시하면 에이전트는 `update_project_rules`를 호출해 `styleRules`에 저장한다. 저장되지 않은 지시는 다음 배치에 반영되지 않는다 — 패널에서 그 사실을 사용자에게 알린다.
- 패널 세션에도 쓰기 도구는 `update_project_rules`, `propose_glossary_terms`만 허용한다.
