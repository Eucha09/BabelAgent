# Babel Agent

게임 로컬라이제이션 데스크톱 앱. Electron + React + TypeScript, 에이전트 엔진은 Claude Agent SDK.
작업 흐름: 원문 입력 → 컨텍스트 보강 → 용어집 → 번역 → 검토/QA → Unity Localization CSV 내보내기.

이 파일은 Babel Agent를 **개발하는** 세션의 규칙이다. 앱이 실행하는 번역 세션에는 전달되지 않는다.

## 명령어

- `npm run dev` — electron-vite 개발 모드
- `npm test` — Vitest
- `npm run typecheck` — tsc --noEmit
- `npm run build` / `npm run dist` — 빌드 / electron-builder 패키징(로컬, 올리지 않음)
- `release.bat [버전]` (`npm run release`) — 릴리스. 새 버전을 묻고 typecheck·test 후 버전 커밋·태그(`v*`)를 만들어 올린다. GitHub Actions 가 태그를 빌드해 Releases 에 공개한다
- `npm run icon` — `build/icon.svg`에서 아이콘 래스터와 `AppIcon.tsx` 생성

## 폴더 구조

- `src/main/` — Electron 메인. Agent SDK, 파일 I/O, MCP 도구
- `src/preload/` — contextBridge 노출
- `src/renderer/` — React UI
- `src/shared/` — 공용 타입과 zod 스키마. IPC 채널 이름과 페이로드 타입은 여기 한 곳에서만 정의한다
- `src/core/` — 결정론적 로직(CSV, 해시, QA, 문법, 내보내기). Electron API에 의존하지 않는다 — 단위 테스트를 위해
- `docs/` — 세부 설계 문서

## 프로세스 경계

- Agent SDK는 메인 프로세스에서만 실행한다. 렌더러에서 직접 import 금지.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. 렌더러는 preload가 노출한 IPC로만 통신한다.
- 렌더러에서 임의 경로를 읽고 쓰는 IPC를 만들지 않는다. 열린 프로젝트 폴더 기준 상대 경로만 받고 메인에서 검증한다.
- 결정론적 작업은 `src/core/`에 코드로 구현하고, 에이전트에는 SDK 인프로세스 MCP 서버(`createSdkMcpServer`)의 커스텀 도구로 노출한다. LLM이 CSV를 파싱하거나 QA를 판정하게 하지 않는다.

## 에이전트 세션

- 모든 세션에 `settingSources`를 명시한다(기본 `[]`). 사용자 PC의 Claude Code 설정과 이 CLAUDE.md가 번역 세션에 섞이면 안 된다.
- 권한은 최소로. `Bash`와 파일 쓰기 도구는 비허용하고, 커스텀 MCP 도구만 허용한다. `cwd`는 열린 프로젝트 폴더로 제한한다.
- 인증은 Claude Code 에 로그인한 방식을 그대로 쓴다: Claude 구독 계정, Anthropic Console(API 과금), 환경 변수 `ANTHROPIC_API_KEY` 등. 앱은 방식을 고르지도 막지도 않는다 — Claude Code 의 인증 방법을 막지 않는 것이 Anthropic 의 조건이다(`docs/architecture.md` "인증과 Claude Code").
- 앱은 로그인 코드·토큰·API 키를 받거나 저장하거나 중계하지 않는다. 로그인은 Claude Code 가 **자기 창**(Windows: `conhost.exe` 로 연 콘솔)에서 Anthropic 의 흐름으로 진행하고, 앱은 창이 닫히면 `claude auth status --json`으로 결과만 읽는다. 로그아웃도 CLI 에 맡긴다.
- 인증 방식은 `auth status`의 `apiKeySource`로 가린다(Console 로그인도 `authMethod`가 `claude.ai`로 온다). 구독 사용량 막대(`/usage`)는 구독일 때만 보여 준다.
- 구독 사용량 한도는 `/usage` 로컬 슬래시 명령을 돌려 응답의 `usage_report.rate_limits.limits[]`에서 읽는다. 출력 문장을 파싱하지 않는다 — 문구와 날짜 형식은 로케일에 따라 바뀐다.
- 사용량 행의 종류(`kind`)를 열거형으로 좁히지 않는다. 서버가 미터를 추가해도 그대로 렌더링하고, 모르는 종류는 서버 값을 그대로 보여준다.
- CLI를 직접 실행할 때는 `shell: true`를 쓰지 않는다 — 경로의 공백·특수문자가 인자로 재해석되면 안 된다. `.cmd`·`.bat` 실행 파일은 셸이 필요하므로 쓰지 않는다.
- Claude Code 실행 파일은 한 곳(`src/main/agent/claude-cli.ts`)에서 정하고, 로그인·상태 조회·에이전트 세션이 모두 같은 것을 쓴다. 순서: 설정한 경로 → 공식 설치(`%USERPROFILE%\.local\bin`) → PATH → Agent SDK 내장(개발 중에만). 세션에는 항상 `pathToClaudeCodeExecutable`로 넘긴다.
- 설치판에는 Agent SDK 내장 Claude Code(플랫폼 패키지)를 넣지 않는다. 앱을 켤 때 확인 창이 Claude Code 를 찾아 `claude update`로 최신으로 맞추고, 끝날 때까지 앱을 가린다. 업데이트 결과는 출력 문장이 아니라 앞뒤 `--version`으로 판단한다. 최소 버전은 Agent SDK `package.json`의 `claudeCodeVersion`이다.
- Claude Code 가 없으면 사용자가 [설치]를 눌렀을 때만 공식 설치 스크립트를 **보이는 창**에서 돌린다. 인터넷에서 받은 스크립트를 몰래 실행하지 않는다.
- 배치 작업(번역, 컨텍스트 추정, 용어 추출)은 배치마다 새 `query()`로 실행한다. 세션 재사용 금지. 행 단위 리롤도 일회성 세션.
- 배치 크기는 30행 또는 원문 3,000자 중 먼저 도달하는 쪽. 둘 다 project.json에서 조정 가능하게 둔다.
- 동시 실행은 기본 2, 상한 3. 상한을 넘기는 설정값은 코드에서 잘라낸다.
- 프롬프트는 고정 부분(역할, 게임 소개, 톤 가이드) → 가변 부분(이번 배치 문자열, 배치에 등장하는 용어만 필터링한 용어집) 순서로 조립한다. 프롬프트 캐싱이 깨지므로 고정 부분에 타임스탬프 등 매번 바뀌는 값을 넣지 않는다.
- 장르, 게임 소개, 톤 가이드는 project.json에서 읽는다. 프롬프트에 특정 장르나 특정 언어를 하드코딩하지 않는다.
- 배치 결과는 텍스트가 아니라 `submit_translations` MCP 도구로 받는다. 도구 입력 스키마(`{ key, text, confidence, note }[]`)가 곧 zod 검증이다. 도구가 키 집합(누락·초과·중복)과 빈 번역을 검사해 문제를 돌려주면, 에이전트는 같은 세션에서 **한 번만** 고쳐 다시 낼 수 있다. 그래도 실패하면 배치 전체를 기록하지 않고 보고한다 — 부분 기록은 재개 지점을 흐린다. 배치 단위 자동 재시도는 없다.
- 배치 세션의 도구는 `submit_translations` 하나뿐이다. 필요한 데이터는 프롬프트에 다 넣는다 — 읽기 도구를 부를수록 턴과 사용량만 는다. 읽기 도구는 에이전트 패널 채팅에 붙인다.
- 배치 기록은 원자적으로 한다. 통과한 배치 전체를 한 번에 CSV에 병합한다.
- 사용량 한도 오류가 나면 진행 중인 배치까지 모든 작업자를 중단하고(기록 안 함) 큐 앞으로 되돌린다. 응답에 재설정 시각이 있으면 그때까지, 없으면 1/2/5/10분 백오프로 대기한다. 자동 무한 재시도 금지 — 수동 재시도 버튼을 제공한다.
- 재개 시 미완료 행부터 처리한다.
- 에이전트 패널 채팅만 `resume` 가능한 세션으로 유지한다. 사용자의 지속적 지시(스타일 규칙 등)는 도구로 project.json에 저장해 이후 모든 배치에 반영한다. 중요한 결정이 대화 속에만 남게 하지 않는다.

## 데이터

프로젝트는 폴더 하나로 저장하고 CSV가 원본(source of truth)이다. 앱 내부 DB에 원본을 두지 않는다. 열 정의는 `docs/data-format.md`.

- `project.json` — schemaVersion, 설정, sourceLanguage, 대상 언어, 톤 가이드, 스타일 규칙
- `strings_master.csv` — 원문. `smart` 열(선택)에 Unity Smart String 여부
- `translations_{lang}.csv` — 언어별 번역
- `glossary.csv` — 용어집
- `grammar_*.csv` — 어픽스 조합용 문법 테이블. 동적 텍스트 조합이 필요한 프로젝트에서만 쓰는 선택 기능

규칙:

- CSV는 `csv-parse`/`csv-stringify`로만 읽고 쓴다. 직접 `split(',')` 금지. 쉼표·줄바꿈·따옴표가 포함된 값이 왕복 후에도 손상되지 않아야 한다.
- 읽기는 UTF-8을 먼저 시도하고 실패하면 `iconv-lite`로 CP949를 시도한 뒤 사용자에게 알린다. 저장은 항상 UTF-8.
- 쓰기는 임시 파일에 쓴 뒤 원자적으로 교체한다 — 작업 중 크래시로 원본이 깨지면 안 된다.
- 윈도우 파일 잠금 오류(`EBUSY`/`EPERM`)는 원인을 안내한다. "엑셀에서 파일이 열려 있는지 확인" 수준까지 메시지에 담는다.
- 파일을 읽을 때 내용 해시를 보관하고, 저장 직전 디스크 해시와 비교한다. 다르면 충돌 대화상자를 띄운다. 조용히 덮어쓰지 않는다.
- `chokidar`로 프로젝트 폴더를 감시한다. 미저장 변경이 없을 때만 자동 리로드하고, 있으면 알림만 띄운다.
- 상태값은 `untranslated | draft | review | approved | stale` 다섯 개만 쓴다.
- `source_hash`는 원문 텍스트만 해시한다(`\r\n`→`\n` 정규화만 적용). `context`, `max_len` 같은 메타데이터 변경은 stale을 유발하지 않는다.
- 원문이 바뀌면 `source_hash` 불일치로 해당 번역을 `stale`로 표시한다. 기존 번역 텍스트는 지우지 않는다.
- `approved` 행은 사용자의 명시적 조작 없이 덮어쓰지 않는다. 배치 번역은 `approved` 행을 건너뛴다.
- 원문 언어는 project.json의 `sourceLanguage`에서 읽는다. 코드는 특정 원문 언어를 전제하지 않는다.
- 언어별 문법 로직(한국어 받침·조사 판정 등)은 `src/core/grammar/<lang>.ts`로 분리하고 레지스트리로 조회한다.
- `schemaVersion`은 1부터 시작하는 정수. 마이그레이션은 버전당 함수 하나로 순차 적용하고, 실행 전 프로젝트 폴더를 백업한다. 앱이 아는 버전보다 높으면 열기를 거부한다.

## QA 검증

`src/core/qa/`에 코드로 구현한다. 전부 단위 테스트 대상. 상세 규칙은 `docs/qa-rules.md`.

- 변수와 리치 텍스트 태그는 번역 전후로 집합이 동일해야 한다. 순서와 등장 횟수는 보지 않는다.
- 변수 집합 비교에서 빈 플레이스홀더 `{}`는 제외한다.
- 변수 이름의 기준은 검사 시점에 원문에서 코드로 재추출한 집합이다. `vars` 열은 name별 `type`/`meaning`/`example` 메타데이터(JSON 배열)일 뿐이며, 재추출 결과와 불일치하면 경고한다.
- Smart Strings는 자체 토크나이저로 검사한다. 중괄호 짝과 변수 이름 집합(인덱스와 이름 모두) 불일치는 오류.
- 포매터 이름이 생략된 형태(`{0:a|b|c}`)는 정상 구문으로 처리한다.
- 포매터 목록에 없는 이름은 오류가 아니라 경고로 올린다 — 커스텀 포매터를 등록한 프로젝트가 있다.
- 포매터 구성이 원문과 달라도 허용한다 — 언어마다 필요한 분기 수가 다르다.
- 포매터 목록과 Unity SmartFormat 설정(`alternativeEscaping`, `escapeChar`, `convertCharacterStringLiterals`, `caseSensitive`)은 project.json의 `smartStrings`에서 읽는다. 토크나이저와 QA는 이 값을 따르고 이스케이프 규약을 코드에 박지 않는다.
- 용어집 위반은 기본 경고. 용어별 `strict`가 켜진 항목만 오류.
- `max_len` 초과, 빈 번역, 태그 짝 불일치를 검사한다.
- 결과는 경고와 오류로 구분한다. 오류는 내보내기를 막고, 경고는 막지 않는다.

## 내보내기

- 기본은 템플릿 없이 자동 생성한다. 형식은 Unity Localization CSV 확장의 기본 구성: `Key`, `Id`, `Shared Comments`(선택), 언어별 `{언어명}({로케일 코드})` 열, 언어별 `… Comments` 열(선택). 열 이름이 다르면 Unity가 그 열을 조용히 무시하므로, 내보내기 전에 만들어질 헤더를 미리 보여준다.
- `Id`는 알 수 없으면 비운다. Unity가 가져올 때 새 Id를 붙인다.
- 언어별 `unityLocaleCode`와 `columnName`은 project.json `export.locales`에 두고 프로젝트 화면(project.json 설정 화면)에서 고친다. 언어명·로케일 코드를 코드에 박지 않는다 — 빈 값일 때만 자동으로 채운다.
- `Shared Comments`에 `context`를 넣을지는 옵션이다. 옵션을 끄면 열을 만들지 않는다 — 빈 칸은 Unity의 기존 주석을 지운다.
- 선택: Unity 프로젝트 폴더를 연결하면 로케일 에셋과 String Table 공유 데이터 에셋(YAML)을 **읽기만** 해서 실제 로케일 코드와 기존 키의 Id를 가져온다. 필드 이름은 실제 파일로 확인한 것만 쓴다. 읽기에 실패하면 기본 자동 생성으로 대신하고 이유를 알린다.
- 선택: 헤더를 바꾼 Unity 프로젝트를 위해 Unity에서 내보낸 샘플 CSV를 템플릿으로 등록할 수 있다. 등록하면 템플릿의 열 이름과 순서를 따른다.
- `strings_master.csv`의 `smart` 열이 Smart String 여부다. 토크나이저가 Smart 구문을 찾으면 `true`로 제안하고 사용자가 적용한다. Unity CSV는 Smart 플래그를 옮기지 않으므로, 내보낼 때 Smart 항목 목록을 보여주고 별도 파일로도 쓴다.
- 상세는 `docs/unity-export.md`.

## UI

- 단일 창 구조: 상단 제목 바(드래그 영역 + 맥락 칩), 왼쪽 사이드바(열린 프로젝트 + 단계 메뉴), 가운데 메인 작업 영역(그리드 중심), 오른쪽 접을 수 있는 에이전트 패널, 하단 상태바.
- OS 기본 제목 표시줄은 쓰지 않는다(`titleBarStyle: 'hidden'` + `titleBarOverlay`). 상단 바 오른쪽 끝은 창 버튼 자리로 비워 둔다.
- 시각 언어: 중성 저채도 그레이 표면, 미세한 테두리, 알약형 칩, 밝기를 반전한 기본 버튼. 색은 의미(번역 상태, 변수·태그 토큰, 진단 심각도)에만 쓴다.
- 그리드는 TanStack Table + TanStack Virtual. 수천 행을 다루므로 가상 스크롤 없이 렌더링하지 않는다.
- 다크 테마 한 벌만 지원한다. 색상은 `src/renderer/styles/tokens.css`의 CSS 변수로만 정의한다. 컴포넌트에 색 리터럴(`#fff`, `rgb(...)`)을 쓰지 않는다.
- 예외는 `src/main/index.ts`의 창 크롬 색 상수 하나뿐이다. CSS를 쓸 수 없는 자리이므로 tokens.css 값과 맞춰 둔다.
- 앱 아이콘 원본은 `build/icon.svg` 하나다. `npm run icon`이 창·패키징용 `icon.png`/`icon.ico`와 상단 바용 `AppIcon.tsx`를 함께 생성한다. `AppIcon.tsx`는 생성물이므로 직접 고치지 않는다 — 모양은 SVG에서만 바꾼다.
- 키, 변수, 태그는 고정폭 폰트로 표시하고 변수와 태그는 색으로 강조한다.
- UI 텍스트는 한국어로 작성한다. 앱 자체의 다국어화는 범위 밖이므로 문자열을 한국어로 직접 적는다.
- 오래 걸리는 작업은 진행률과 취소 수단을 제공한다. 한도 대기 중에는 남은 대기 시간과 재시도 버튼을 보여준다.

## 코딩 규칙

- TypeScript strict 모드. `any`와 타입 단언을 피한다.
- 외부 입력은 경계에서 zod로 검증한다. 대상은 project.json, IPC 페이로드, LLM 출력 JSON. 타입은 `z.infer`로 스키마에서 끌어낸다 — 스키마와 타입이 갈라지면 안 된다.
- `src/core/`의 결정론적 모듈(CSV 입출력, 해시, QA 검증, 한국어 받침 판정, 내보내기)은 단위 테스트를 반드시 작성한다. 테스트는 소스 옆에 `*.test.ts`로 둔다.
- 주석, 커밋 메시지, `docs/` 문서는 한국어로 쓴다. 식별자는 영어.
- 커밋 전에 `npm run typecheck`와 `npm test`를 통과시킨다.

## 배포

- 릴리스는 `v*` 태그로만 한다. GitHub Actions(`.github/workflows/release.yml`)가 빌드해 GitHub Releases 에 바로 공개한다. 태그는 `package.json` 버전과 같아야 하므로 `release.bat`(`scripts/release.cjs`, 안에서 `npm version`)으로 만든다.
- 앱 업데이트는 electron-updater 로 공개 릴리스의 `latest.yml`을 본다. 확인은 자동(켤 때·6시간마다), 받기는 사용자가 [받기]를 누를 때만, 설치는 [다시 시작해 설치] 또는 앱을 끌 때. 작업이 도는 중에는 다시 시작하지 않는다.
- 설치 파일은 코드 서명이 없다. 업데이트는 서명 대신 `latest.yml`의 sha512 로 검사한다.
- 저장소 주소는 `electron-builder.yml`의 `publish`와 `src/main/update/app-update.ts`의 `RELEASES_URL` 두 곳에 있다. 바꿀 때 함께 바꾼다.

## 참조 문서

- `docs/architecture.md` — 프로세스 경계, IPC 채널 목록, MCP 도구 목록, 작업 스케줄러, 인증과 Claude Code, 앱 업데이트와 릴리스
- `docs/data-format.md` — project.json 스키마, CSV 열 정의, 상태 전이, 해시·인코딩·충돌 규칙
- `docs/agent-prompts.md` — 프롬프트 조립 구조, 배치 산정, 응답 JSON 스키마, 한도 처리
- `docs/qa-rules.md` — 변수·태그·Smart Strings·용어집 검사 규칙과 심각도
- `docs/unity-export.md` — Unity Localization CSV 자동 생성 헤더, Unity 프로젝트 연결, 템플릿(선택), Smart 항목, 확인한 Unity 가져오기 동작
