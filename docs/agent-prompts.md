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
  prompt: batchPrompt,                  // 가변 부분
  options: {
    settingSources: [],                 // 사용자 PC 설정과 이 저장소의 CLAUDE.md 차단
    cwd: projectDir,
    tools: [],                          // 내장 도구 전부 끔
    disallowedTools: ['Bash', 'Write', 'Edit', 'NotebookEdit'],
    permissionMode: 'dontAsk',         // 허용 목록에 없으면 묻지 않고 거부
    systemPrompt: fixedPrompt,          // 고정 부분. 작업마다 한 번 만들어 모든 배치가 같은 문자열을 쓴다
    mcpServers: { babel: submitServer },// 배치 전용 서버(아래). 배치마다 새로 만든다
    allowedTools: ['mcp__babel__submit_translations'],
    maxTurns: 6,                        // 제출 + 수정 한 번 + 여유
    model,                              // translate.model. default 면 넣지 않아 CLI 설정을 따른다
    effort,                             // translate.effort(사고 수준). 모델이 지원하지 않는 수준은 CLI 가 낮춘다
    pathToClaudeCodeExecutable: appSettings.cliPath ?? undefined,
  },
})
```

- 배치 세션의 도구는 `submit_translations` 하나다. 원문·컨텍스트·용어는 프롬프트에 다 들어 있으므로 읽기 도구를 주지 않는다.
- MCP 도구 이름은 `mcp__<서버>__<도구>` 로 허용 목록에 넣는다(서버 이름 `babel`).

## 프롬프트 조립 순서

고정 부분 → 가변 부분. 고정 부분은 프로젝트 설정이 바뀌지 않는 한 **문자 단위로 동일**해야 한다(프롬프트 캐싱).

1. 역할과 출력 규약 — 상수 문자열. `note`를 쓸 언어(`sourceLanguage`)도 여기서 지시한다
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

에이전트는 텍스트로 답하지 않고 `submit_translations` 도구로 제출한다. 도구 입력 스키마가 곧 검증 스키마다(`src/core/translate/submission.ts`).

```ts
const SubmittedTranslation = z.object({
  key: z.string().min(1),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  note: z.string().optional(),
})
// 도구 입력: { translations: SubmittedTranslation[] }
```

검증 순서:

1. 입력 스키마(zod) — SDK가 도구를 부르기 전에 검사한다. 어긋나면 에이전트에게 오류가 돌아간다
2. 키 집합(누락·초과·중복)과 빈 번역 — 도구 핸들러가 검사한다. 실패하면 문제를 돌려주고, **같은 세션에서 한 번만** 다시 받는다
3. 행별 QA(`docs/qa-rules.md`) — 첫 제출에서는 오류를 모두 돌려줘 고칠 기회를 준다. 마지막 제출에서 구조 오류(변수·중괄호·태그)가 남으면 배치를 거부하고, 길이 초과·strict 용어 위반만 남으면 받아서 기록한다(검토 화면이 오류로 띄운다). 판정은 `judgeSubmission`(`src/core/translate/submission.ts`)
4. 통과 → 보관해 두었다가 세션이 끝나면 배치 전체를 원자적으로 기록, 상태 `draft`. 번역할 때 본 원문을 `source_snapshot`에 함께 남긴다

- 도구 응답의 문제 목록은 `키: ruleId (대상)` 형식의 짧은 영어다. 예: `quest_01: var.missing (playerName); title: len.over_max (23/20)`.

- 제출이 두 번 다 실패하거나 제출이 없으면 배치 실패로 보고한다. 배치 단위 자동 재시도는 하지 않는다.
- 통과한 제출이 있으면, 그 뒤 한도 대기로 중단 신호가 왔더라도 기록한다. 배치가 온전하므로 버릴 이유가 없다.
- 기록은 번역 파일을 다시 읽어 합친 뒤 원자적으로 쓴다. 동기 함수 하나라서 같은 프로세스의 다른 작업자가 사이에 끼지 못한다. `approved` 는 여기서도 한 번 더 막는다.

## 작업별 프롬프트

### 번역

- 출력: `TranslationResponse`
- 지시 요점: 변수와 태그를 원문과 동일한 집합으로 유지, `max_len` 준수, 용어집의 확정 번역 사용, 불확실하면 `confidence`를 낮추고 `note`에 이유.
- `note`는 원문 언어(`sourceLanguage`)로 쓴다. 메모를 읽는 검토자는 원문을 쓰는 사람이기 때문이다. 지시문 자체는 영어로 두고 언어 이름만 설정에서 넣는다 — 특정 언어를 하드코딩하지 않는다. 고정 부분이라 프로젝트의 원문 언어가 같으면 문자열이 바뀌지 않는다(캐싱 유지). 행 재번역도 같은 고정 부분을 쓰므로 후보 메모도 원문 언어로 나온다.
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
- 시스템 프롬프트는 배치와 **같은 문자열**(`buildSystemPrompt`)이다. 캐시가 그대로 걸린다.
- 가변 부분(`buildRerollPrompt`): 배치 프롬프트 형식의 행 하나 + 현재 번역 + (원문이 바뀐 행이면) 그 번역이 보고 쓴 원문 + 검토자 지시(비었으면 "더 나은 대안을 내라"). 지시는 사용자가 쓴 그대로 넣는다.
- 제출은 같은 `submit_translations` 도구(기대 키 하나)로 받는다. QA 오류는 한 번 고칠 기회를 주고, 그래도 남으면 후보로 받아 진단과 함께 보여 준다.
- 모델은 `translate.model`을 따른다.
- 한도에 걸리면 재설정 시각을 알리고 끝낸다. 자동으로 다시 시도하지 않는다 — 사용자가 다시 누른다.
- 시작·후보·실패는 작업 로그(`job:log`)에 남는다.

## 사용량 한도 처리

감지 경로(구조화된 신호를 먼저 본다): `rate_limit_event` 의 `status: rejected`(재설정 시각 포함) → `assistant.error === 'rate_limit'` → 결과 메시지 `errors` 와 던져진 예외의 문장. `resetsAt` 은 단위가 문서에 없어 초·밀리초를 모두 받는다.

- 한도 오류를 받으면 작업 상태를 `waiting-limit`으로 바꾸고, 진행 중인 다른 배치까지 중단 신호를 보내 큐 앞으로 되돌린다. 중단된 배치는 기록하지 않는다.
- 일시정지 중에 한도에 걸렸다면 대기가 끝나도 일시정지로 돌아간다.
- 화면 확인용: `BABEL_FAKE_LIMIT=1` 로 앱을 띄우면 실행당 한 번, 첫 배치가 20초짜리 가짜 한도 오류를 낸다.
- 응답에 재설정 시각이 있으면 그 시각까지 대기한다. 없으면 1 → 2 → 5 → 10분 백오프.
- 10분 백오프 이후에도 실패하면 자동 재시도를 멈추고 사용자 조작을 기다린다.
- UI는 남은 대기 시간과 "지금 재시도" 버튼을 보여준다.
- 대기 중에도 이미 기록된 결과는 그대로 유지된다. 재개는 미완료 행 재계산으로 이뤄진다.

## 에이전트 패널

- 유일하게 `resume`으로 이어지는 세션. 사용자가 프로젝트를 닫으면 세션 ID를 버린다.
- 사용자가 "앞으로 ~하게 해줘"라고 지시하면 에이전트는 `update_project_rules`를 호출해 `styleRules`에 저장한다. 저장되지 않은 지시는 다음 배치에 반영되지 않는다 — 패널에서 그 사실을 사용자에게 알린다.
- 패널 세션의 도구(M3): 읽기 전용 `get_project_context`, `get_strings_batch`, `get_glossary_terms`. 부를 때마다 패널에 도구 줄이 남는다.
- 쓰기 도구 `update_project_rules`, `propose_glossary_terms` 는 아직 없다(M5).
