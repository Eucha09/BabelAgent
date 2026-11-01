# 아키텍처

## 프로세스 구성

```
┌─ 렌더러 (React) ────────────┐
│  사이드바 · 그리드 · 에이전트 패널 │
└──────────┬──────────────────┘
           │ window.babel.*  (preload / contextBridge)
┌──────────▼──────────────────┐
│ 메인 프로세스                  │
│  ├ IPC 핸들러                 │
│  ├ 프로젝트 저장소 (CSV I/O)     │
│  ├ 작업 스케줄러 (배치 큐)        │
│  └ Agent SDK + 인프로세스 MCP   │
└──────────┬──────────────────┘
           │ 파일 시스템 (프로젝트 폴더)
```

- 렌더러는 파일 시스템과 Agent SDK에 직접 접근하지 않는다.
- `src/core/`는 Electron에 의존하지 않는 순수 모듈이다. 메인 프로세스가 `src/core/`를 호출하고, MCP 도구도 같은 함수를 호출한다. 같은 로직을 두 번 구현하지 않는다.

## 계층 책임

| 계층 | 책임 | 금지 |
|---|---|---|
| `src/renderer/` | 표시, 입력, 낙관적 UI 상태 | 파일 I/O, 경로 조립, 비즈니스 검증 |
| `src/preload/` | 채널 화이트리스트 노출 | 로직 |
| `src/main/` | IPC, 스케줄러, SDK 세션, 경로 검증 | CSV 파싱·QA 직접 구현(core 호출) |
| `src/core/` | CSV, 해시, QA, 문법, 내보내기, 마이그레이션 | Electron·fs 경로 가정, 전역 상태 |
| `src/shared/` | 채널 상수, zod 스키마, 타입 | 런타임 로직 |

## IPC 규칙

- 채널 이름은 `domain:action` 형식. 상수는 `src/shared/ipc.ts`에만 정의하고 문자열 리터럴을 직접 쓰지 않는다.
- 요청/응답 페이로드마다 zod 스키마를 정의하고 메인에서 `parse`한 뒤 처리한다.
- 요청·응답은 `ipcMain.handle`, 진행 상황은 `webContents.send` 이벤트로 분리한다.
- 모든 경로 인자는 프로젝트 폴더 기준 상대 경로. 메인에서 정규화 후 프로젝트 폴더 밖이면 거부한다.

### 채널 목록 (초안)

호출형(`invoke`):

| 채널 | 용도 |
|---|---|
| `project:pick` | 폴더 선택 대화상자 |
| `project:open` | 프로젝트 로드, schemaVersion 확인·마이그레이션 |
| `project:rules:apply` | 에이전트 패널의 스타일 규칙 카드에서 [저장]. 메인이 지금 규칙에 다시 적용해 보고(`core/project/rules.ts`) 설정 검증을 통과하면 project.json 에 쓴다. 저장한 규칙 id 와 새 설정을 돌려준다 |
| `project:settings:set` | project.json 부분 갱신. 프로젝트·번역·설정 화면이 바뀐 묶음(name, sourceLanguage, targetLanguages, game, styleRules, batch, translate, review, context, smartStrings)만 보내면, 메인이 지금 설정에 합치고 `core/project/settings.ts`의 검증을 통과해야 쓴다. schemaVersion·grammar 는 받지 않는다. export 는 경로가 아닌 값(언어별 로케일 코드·열 이름, 내보내기 옵션)만 받는다 — Unity 프로젝트 경로와 템플릿 경로는 대화상자 채널로만 정한다. 같은 값이면 쓰지 않는다 |
| `strings:list` | 원문 + 선택 언어 번역 조인 결과, 원문 파일 존재 여부 |
| `strings:save` | 원문 전체 저장(편집·행 추가·순서 변경·삭제). 키 검사 후 해시 재계산, 충돌 감지, 모든 번역 파일의 stale 갱신과 `deletedKeys` 행 삭제 |
| `strings:create` | 헤더만 있는 빈 `strings_master.csv` 생성 |
| `strings:import:preview` | 가져올 CSV 선택, 헤더·샘플·인코딩·매핑 추측 |
| `strings:import` | 열 매핑대로 원문에 합치고 저장 |
| `translation:update` | 검토 화면의 행 하나 저장(번역문·상태·메모, 후보 적용 시 신뢰도). 번역 파일을 다시 읽어 행 단위로 충돌을 보고, 상태 전이는 `core/status.ts`가 판정한다. 승인도 이 채널로 한다 — QA 오류가 있으면 거부. 저장한 행의 진단을 돌려준다 |
| `translation:approve` | 초안 일괄 승인. 화면이 고른 키와 그때 본 행을 받아, 메인이 번역 파일을 다시 읽고 조건(초안·QA 진단 없음·신뢰도 기준 이상)을 행마다 다시 확인한 뒤 통과한 행만 한 번에 쓴다. 승인·건너뜀(이유) 목록을 돌려준다 |
| `glossary:list` | 용어집 화면용 항목(승인 대기 포함). 같은 용어(대소문자 무시)가 여러 행이면 첫 행만 담고 알린다 |
| `glossary:update` | 용어 추가·수정·삭제·승인을 한 번에. 행마다 화면이 본 값(`expected`)을 받아, 메인이 파일을 다시 읽어 그 행이 바뀌었으면 건너뛰고 나머지만 원자적으로 쓴다 |
| `glossary:extract` | 용어 추출 작업 시작(전체 원문 / 선택 행) |
| `glossary:add` | 용어 하나를 에이전트로 채워 승인 대기로 추가(일회성 세션). 원문에 없거나 이미 있는 용어는 거부. 추가한 항목, 원문에서 찾은 행 수, 기존 번역과 어긋나는 행을 돌려준다 |
| `glossary:retranslate` | 용어 하나 재번역(일회성 세션, 지시 포함). 결과는 쓰지 않고 새 번역·근거·신뢰도와 기존 번역과 어긋나는 행을 돌려준다 — 화면이 그 행의 칸에 미저장 편집으로 채운다 |
| `glossary:agent:cancel` | 진행 중인 용어 추가·재번역 취소 |
| `context:list` | 승인을 기다리는 메타데이터 제안과 지금 원문 행(원문 변경·원문 없음 표시) |
| `context:estimate` | 컨텍스트 추정 작업 시작(채울 필드, 빈 칸 있는 행 / 선택 행) |
| `context:apply` | 사람이 고친 제안을 strings_master.csv 에 넣고 그 제안을 지운다. 화면이 본 뒤 원문 칸이 바뀐 행은 건너뛴다 |
| `context:discard` | 제안 버리기 |
| `qa:run` | 언어 하나 전체 QA. 진단이 있는 키만 돌려준다 |
| `job:start` | 배치 번역 시작(대상 언어·범위·선택 키·모델). 고른 모델은 project.json 에 기억 |
| `job:control` | `pause` / `resume` / `cancel` / `retry`(한도 대기 건너뛰기). 번역·컨텍스트 추정·용어 추출 공통 |
| `job:current` | 진행 중이거나 마지막 작업의 상태. 화면을 다시 열 때 이어 보기용 |
| `usage:read` | 구독 사용량 한도(`/usage`). 화면은 구독 로그인일 때만 부른다 |
| `auth:status` | `claude auth status --json`. `null` 필드도 "없음"으로 받는다(Console 로그인의 `subscriptionType`) |
| `auth:login:start` | `{ method: 'claudeai' \| 'console' }`. Claude Code 로그인을 자기 창(conhost)에서 연다. 앱은 코드·토큰을 받지 않는다 |
| `auth:login:cancel` / `auth:logout` | 로그인 창 닫기 / CLI 로 로그아웃 |
| `cli:status` | 앱이 쓰는 Claude Code 실행 파일(경로·출처)·버전·실행 실패 이유·최소 버전 |
| `cli:update` | `claude update` 후 앞뒤 버전 비교(updated / current / failed / skipped). 동시에 들어온 요청은 하나로 합친다. 작업이 도는 중에는 거부 |
| `cli:install` / `cli:install:cancel` | 공식 설치 스크립트를 보이는 콘솔 창에서 실행 / 그 창 닫기 |
| `row:reroll` | 행 단위 재번역(일회성 세션, 사용자 지시 포함). 결과는 쓰지 않고 후보와 그 진단을 돌려준다. 한도에 걸려도 자동으로 다시 시도하지 않는다 |
| `row:reroll:cancel` | 진행 중인 재번역 취소 |
| `agent:chat:send` | 에이전트 패널 메시지 전송 |
| `export:preview` | 내보내기 미리보기(쓰지 않음). 화면이 고른 언어·옵션·파일 이름을 받아 원문·번역·Unity 읽기 결과·템플릿으로 계획(`core/export/plan.ts`)을 세우고, 번역문을 그대로 내보내는 칸만 QA 한다. 헤더(열마다 출처), 앞부분 몇 행, 언어별 로케일, Unity·템플릿 상태, 막는 문제·알림, QA 오류(최대 200)·경고 수, Smart 항목, 요약, 출력 파일(있는지) |
| `export:run` | 같은 계획을 다시 세우고 다시 검사한 뒤 `export/`에 쓴다. 막는 문제나 QA 오류가 있으면 쓰지 않는다. 이미 있는 파일은 `overwrite` 확인 없이는 덮지 않는다(`conflict` + 파일 목록). 파일마다 원자적으로 교체 |
| `export:reveal` | `export/` 폴더 열기 |
| `export:unity:link` / `:unlink` / `:reload` / `:collection` | Unity 프로젝트 폴더 연결(메인의 폴더 대화상자, Assets·ProjectSettings 확인)·해제·다시 읽기·컬렉션 고르기. 읽은 결과는 메인이 들고 있다가 연결·다시 읽기 때만 새로 훑는다 |
| `export:template:set` / `:clear` | Unity 에서 내보낸 CSV 를 메인의 파일 대화상자로 골라 템플릿으로 등록(프로젝트 밖이면 `templates/unity_template.csv`로 복사, 열 역할 추론해 저장)·해제 |
| `app:settings:get` / `:set` | CLI 경로·설정 폴더 등 앱 전역 설정 |
| `app:update:status` | 지금 앱 버전·앱 업데이트 상태·릴리스 페이지 주소 |
| `app:update:check` | GitHub Releases 에서 새 버전 확인. 겹친 요청은 하나로 합치고, 받는 중이거나 받아 둔 뒤에는 다시 확인하지 않는다 |
| `app:update:download` / `:cancel` | 찾은 새 버전 받기 시작 / 멈추기. 진행률은 `app:update:state` 이벤트 |
| `app:update:install` | 받아 둔 업데이트 설치(앱을 닫고 조용히 설치한 뒤 다시 연다). 작업이 도는 중에는 거부 |

이벤트(메인 → 렌더러):

| 채널 | 페이로드 |
|---|---|
| `job:update` | 작업 전체 상태(`JobView`): 종류(`kind`: translate / context / terms), running / paused / waiting-limit / done / cancelled, 행·배치 수, 자동 재개 시각, 실패 사유 |
| `job:log` | 작업 로그 한 줄(배치 시작·제출 통과/실패·기록·한도·끝, 행 재번역). 번역 화면과 에이전트 패널이 같이 쓴다 |
| `project:changed` | `project.json`이 앱 밖에서 바뀌어 메인이 다시 읽은 설정. 읽기에 실패하면 보내지 않고 이전 설정을 유지한다 |
| `data:written` | 작업이나 패널 도구가 프로젝트 파일(glossary.csv, context_suggestions.csv)을 썼다. 앱이 쓴 파일은 감시자가 알려 주지 않으므로 그 파일을 보는 화면이 이 이벤트로 다시 읽는다 |
| `agent:chat:tool` | 패널 채팅에서 에이전트가 부른 도구(이름·요약·성공 여부) |
| `agent:chat:rule` | 패널 에이전트가 낸 스타일 규칙 제안(추가·수정·삭제). 패널이 확인 카드로 띄운다 |
| `agent:chat:delta` | 스트리밍 텍스트 조각 |
| `file:changed` | 앱 밖에서 바뀐 파일 이름. 자동 리로드 여부는 렌더러가 미저장 변경을 보고 정한다 |
| `auth:login:done` | 로그인 창이 닫혔다(종료 코드). 성공 여부는 화면이 상태를 다시 읽어 판단한다 |
| `cli:install:done` | 설치 창이 닫혔다. 화면이 `cli:status`로 다시 확인한다 |
| `app:update:state` | 앱 업데이트 상태가 바뀔 때마다(확인 중·최신·새 버전·받는 중 n%·받아 둠·오류). 모든 창에 보낸다 |

## MCP 도구 목록 (초안)

인프로세스 MCP 서버(`createSdkMcpServer`)로 노출한다. 입력 스키마는 zod. 각 도구는 `src/core/`의 함수를 그대로 호출한다.

| 도구 | 종류 | 설명 |
|---|---|---|
| `get_project_context` | 읽기 | 장르, 게임 소개, 톤 가이드, 스타일 규칙 — **구현(패널)** |
| `get_strings_batch` | 읽기 | 키 목록으로 원문·context·언어별 번역 조회(최대 50키) — **구현(패널)** |
| `get_glossary_terms` | 읽기 | 주어진 문자열들에 등장하는 승인된 용어만 반환. 찾는 방식은 번역 배치·QA 와 같다 — **구현(패널)** |
| `lookup_grammar` | 읽기 | grammar_*.csv 조회(선택 기능 활성 시) |
| `validate_translation` | 읽기 | 단일 번역안 QA 검사 결과 반환. 에이전트의 자기 점검용 |
| `submit_translations` | 쓰기 | 번역 결과 제출. 키 검사 → 행별 QA 후 보관, 세션 끝에 배치 단위로 기록. 수정 제출 1회 — **구현(배치·행 재번역)** |
| `submit_context` | 쓰기 | 메타데이터 제안 제출. 키·요청 필드·vars 이름 집합(원문 재추출과 같아야 함) 검사, 수정 제출 1회, 마지막 제출은 문제없는 행만 받아 context_suggestions.csv 에 쌓는다 — **구현(컨텍스트 추정 배치)** |
| `submit_terms` | 쓰기 | 용어 후보 제출. 배치 원문에 실제로 나오는지·겹침·언어 코드 검사, 이미 있는 용어는 조용히 뺀다. glossary.csv 에 pending 으로 붙는다 — **구현(용어 추출 배치)** |
| `submit_glossary_entry` | 쓰기 | 용어집 화면 [용어 추가]·[선택 재번역]의 항목 하나 제출. 같은 용어인지·대상 언어마다 번역이 있는지 검사, 수정 제출 1회. 추가는 사용자가 준 품사·지침·strict 가 앞서고 결과는 pending 으로 붙는다. 재번역은 번역과 지침을 다시 받아 화면에 돌려준다(품사는 그대로) — **구현(용어 추가·재번역)** |
| `update_project_rules` | 쓰기 | 스타일 규칙 추가·수정·삭제 제안. 저장하지 않고 패널에 확인 카드를 띄운다 — 사용자가 [저장]을 눌러야 `project:rules:apply` 로 저장된다(사용자 결정, 2026-10-22) — **구현(패널)** |
| `propose_glossary_terms` | 쓰기 | 용어 후보 제출(대상 언어별 번역 포함). glossary.csv 에 pending 으로 붙고, 용어집 화면에서 승인해야 쓰인다 — **구현(패널)** |

- 쓰기 도구는 "요청"이지 "기록"이 아니다. 기록 여부는 항상 코드가 결정한다.
- 배치 세션에는 그 작업의 제출 도구 하나만(`submit_translations` / `submit_context` / `submit_terms`), 패널 채팅에는 읽기 도구 셋과 쓰기 요청 도구 둘을 붙인다. 제출 서버는 도구 이름·입력 스키마·판정 함수를 받는 하나의 구현(`createSubmitServer`)이고, 세션마다 새로 만들어 배치 문맥(기대 키 목록 등)을 클로저로 묶는다(`src/main/agent/tools.ts`).
- 패널 도구는 부를 때마다 지금 열린 프로젝트 설정을 읽는다. 같은 세션 안에서 규칙이 바뀔 수 있다.
- 도구 응답은 간결한 JSON으로 돌려준다. 긴 설명 문장을 담지 않는다 — 토큰 낭비.

## 작업 스케줄러

- 작업(job) 하나 = 대상 행 집합 + 작업 종류(번역 · 컨텍스트 추정 · 용어 추출). 작업은 배치 큐로 쪼개진다.
- 작업은 종류와 상관없이 **한 번에 하나**만 돈다(`src/main/jobs/runner.ts`). 같은 사용량 한도를 나눠 쓰고, 진행 카드·로그·제어를 같이 쓴다. 배치 세션 공통 부분(SDK 로드·옵션·한도·중단 판정)은 `src/main/jobs/agent-batch.ts` 하나다.
- 작업자(worker)는 기본 2개, 상한 3개. 각 작업자는 배치 하나를 새 `query()`로 처리한다.
- 상태: `idle → running → (paused | waiting-limit | error) → running → done/cancelled`.
- 배치 결과는 전원 검증 통과 시에만 원자적으로 기록한다. 실패 시 배치 전체를 미완료로 남기고 실패 사유를 모아 보고한다.
- 진행 상황은 완료된 행 키 집합으로 관리한다. 재개는 "미완료 행 재계산"이며, 중간 커서를 저장하지 않는다 — 파일이 외부에서 바뀌어도 안전하다.
- 작업을 시작할 때 대상 행의 상태(번역문·상태 지문)를 기억해 두고, 배치를 기록할 때 그 사이 사람이 검토 화면에서 고친 행은 덮지 않는다. 덮지 않은 행은 작업 로그에 남는다.
- 사용량 한도: 모든 작업자를 멈추고 `waiting-limit`으로 전환한다. 재설정 시각이 응답에 있으면 그 시각까지, 없으면 1 → 2 → 5 → 10분 백오프. 10분 이후로는 자동 재시도하지 않고 사용자 조작을 기다린다.
- 일시정지 중에 한도에 걸리면 대기가 끝나도 일시정지로 돌아간다. 두 작업자가 같은 한도에 걸려도 대기 단계는 한 번만 센다.
- 스케줄러(`src/main/jobs/scheduler.ts`)는 배치 실행기와 시계를 주입받는다. 가짜 실행기와 가짜 타이머로 한도·일시정지·취소를 단위 테스트한다.
- 작업 종료 후 완료·실패·남은 행 수를 작업 로그에 남긴다.

## 설정 구조

앱 전역 설정(userData)과 프로젝트 설정(project.json)을 구분한다.

앱 전역:

```jsonc
{
  "cliPath": null,              // null이면 공식 설치 → PATH → SDK 내장(개발) 순으로 찾는다
  "claudeConfigDir": null,      // null이면 CLAUDE_CONFIG_DIR, 그것도 없으면 ~/.claude
  "theme": "dark",              // 다크 한 벌만 지원. 확장 자리
  "lastProjectDir": null
}
```

인증 방식은 앱 설정에 두지 않는다(옛 `auth.mode`는 읽을 때 버린다). Claude Code 에 로그인한 방식을 그대로 쓴다.

프로젝트 설정은 `data-format.md` 참조.

## 인증과 Claude Code

Anthropic 문서로 확인한 규칙(2026-10-30, code.claude.com/docs/en/legal-and-compliance, agent-sdk/overview, setup).

- 제3자 개발자는 자기 앱에 Claude.ai 로그인을 제공하거나 구독 자격 증명으로 요청을 대신 보내면 안 되고, Claude.ai 자격 증명·세션 토큰을 모으거나 저장하거나 중계해서도 안 된다. 다만 사용자가 **고치지 않은 Claude Code** 에 자기 구독으로 로그인하는 것은 막지 않는다. Claude Code 를 제품에 넣어 배포하려면 상용 약관에 따르고, Claude Code 의 인증 방법(계정 로그인·사용자 API 키)을 빼거나 막으면 안 된다.
- 그래서 앱은 로그인·토큰·키를 만지지 않고, 로그인은 Claude Code 자기 창에서 끝나며, 구독과 Console 두 버튼을 모두 둔다. 사용자마다 자기 계정·키로 인증한다. 공개 배포 전에는 Anthropic 에 사용 사례를 확인한다.
- Claude Code 실행 파일 선택·버전 확인·업데이트·설치는 `src/main/agent/claude-cli.ts`, 판정 로직은 `src/core/cli/claude.ts`(테스트). 시작 확인 창은 `ClaudeGate`.
- 공식 설치판(native installer)은 스스로도 업데이트된다. 앱은 켤 때 `claude update`를 한 번 더 돌려 확인한다. Windows 는 실행 중인 파일을 잠그므로 작업 중에는 업데이트하지 않는다.
- 새로 받은 실행 파일(300 MB 넘음)은 처음 실행이 백신 검사로 몇 초 걸린다. 버전 확인 제한 시간은 60초이고, 업데이트 직후에는 몇 번 더 확인한다. 개발 모드(React StrictMode)는 마운트 효과를 두 번 돌리므로 시작 확인은 한 번만 시작한다.

## 앱 업데이트와 릴리스

앱(Babel Agent) 자체의 업데이트. Claude Code 업데이트(위 절)와는 별개다.

- 릴리스: `v*` 태그를 올리면 GitHub Actions(`.github/workflows/release.yml`)가 Windows 러너에서 태그와 `package.json` 버전이 같은지 확인하고 typecheck·test·build 뒤, 태그의 초안 릴리스를 만들고 `electron-builder --publish always`로 설치 파일·blockmap·`latest.yml`을 그 초안에 올린 다음 공개한다. 토큰은 Actions 기본 `GITHUB_TOKEN`만 쓴다(`gh` 포함).
- 초안을 먼저 만드는 이유: electron-builder 26.15.3 은 설치 파일과 blockmap 을 동시에 올리면서 같은 태그의 릴리스를 두 개 만들 수 있다(게시자를 캐시에 넣기 전에 `await`). 그러면 `releases/download/<태그>/…` 주소가 한쪽 릴리스만 가리켜 다른 쪽 파일이 404 가 된다(v0.1.1 에서 실제로 겪음). 초안이 있으면 둘 다 그 초안에 올린다. 파일이 다 올라간 뒤 공개하므로 앱이 `latest.yml` 없는 릴리스를 보는 틈도 없다.
- 워크플로 파일을 처음 넣는 커밋과 태그를 한 번에 올리면 태그 이벤트에 워크플로가 돌지 않았다(v0.1.1). 워크플로가 `main`에 있는 지금은 문제없다. 다시 돌리려면 원격 태그를 지우고 다시 올린다. 절차는 `release.bat`(`scripts/release.cjs`): main·커밋 안 한 변경 없음·원격보다 뒤처지지 않음·태그 없음을 확인하고, 새 버전(기본은 다음 패치)과 실행 확인을 받은 뒤 typecheck·test → `npm version <버전> -m "릴리스 %s"` → `git push --atomic origin main v<버전>`. 저장소가 비공개로 보이면 경고한다.
- 설치 파일 이름은 `BabelAgent-Setup-<버전>.exe`. GitHub 는 자산 이름의 공백을 바꿔 올리므로 `latest.yml`과 어긋나지 않게 공백을 뺐다.
- 앱은 electron-updater 로 공개 릴리스의 `latest.yml`을 본다(저장소는 공개여야 한다 — 비공개 릴리스는 토큰 없이 보이지 않는다). 저장소 주소는 `electron-builder.yml`의 `publish`와 `src/main/update/app-update.ts`의 `RELEASES_URL` 두 곳에 있다.
- 확인은 자동: 시작 확인 창(Claude Code)이 끝난 뒤 한 번, 켜 둔 동안 6시간마다. 받기는 사용자가 [받기]를 눌러야 시작하고(상태바 칩·설정 화면 카드), 진행률과 [받기 멈춤]을 보여 준다. 받아 둔 업데이트는 [다시 시작해 설치]로 바로 설치하거나 앱을 끌 때 조용히 설치된다(`autoInstallOnAppQuit`).
- [다시 시작해 설치]는 작업이 도는 중이면 메인이 거부하고, 저장하지 않은 편집이 있으면 화면이 먼저 확인을 받는다.
- 확인 실패(오프라인 등)는 상태바에 띄우지 않고 설정 화면 카드에만 보여 준다. 오류 문장은 오류 코드와 Chromium 네트워크 오류 이름으로만 고르고(`src/core/update/app-update.ts`, 테스트), 원래 메시지는 자세히 보기로 남긴다.
- 코드 서명이 없으므로 `app-update.yml`에 `publisherName`이 없고, electron-updater 는 서명 검사를 건너뛴다. 받은 파일은 `latest.yml`의 sha512 로 검사한다. 신뢰의 기준은 GitHub 저장소다.
- 개발 모드(`app.isPackaged`가 거짓)에서는 확인하지 않고 그 이유를 카드에 보여 준다. 로컬 `npm run dist`는 `--publish never`로 올리지 않는다.
