# Babel Agent

게임 로컬라이제이션을 돕는 Windows 데스크톱 앱입니다. 원문 정리부터 번역, 검토, Unity Localization 내보내기까지 한 곳에서 합니다. 번역은 Claude(Claude Code 와 Claude Agent SDK)가 맡고, 파일 처리와 QA 판정은 앱의 코드가 맡습니다.

작업 흐름: 원문 → 컨텍스트 보강 → 용어집 → 번역 → 검토/QA → Unity Localization CSV 내보내기

## 주요 기능

- **원문**: CSV 가져오기(열 매핑), 그리드 편집, 행 순서 바꾸기, 원문이 바뀐 번역은 자동으로 "원문 변경(stale)" 표시
- **컨텍스트 보강**: 에이전트가 상황 설명·UI 유형·최대 길이·변수 설명을 제안하고, 사람이 고쳐 승인
- **용어집**: 용어 추출·추가·재번역, 승인된 용어만 그 배치에 나오는 것만 번역에 투입, `strict` 용어는 위반 시 오류
- **번역**: 배치 번역(동시 작업자, 사용량 한도 대기·재개), 행 단위 재번역, 스타일 규칙
- **검토/QA**: Unity Smart Strings 토크나이저로 변수·중괄호 검사, 리치 텍스트 태그, 최대 길이, 용어집 위반을 오류/경고로 구분
- **내보내기**: Unity Localization CSV 를 템플릿 없이 자동 생성(`Key`, `Id`, 언어별 열). Unity 프로젝트를 연결하면 로케일 코드와 기존 키 Id 를 읽어 오고, Smart 항목 목록과 폰트 아틀라스용 글자 목록도 함께 씁니다
- **화면 언어**: 한국어·English. 처음에는 Windows 표시 언어를 따르고, 설정 화면에서 바꿀 수 있습니다

프로젝트는 폴더 하나이고 CSV 가 원본입니다(`project.json`, `strings_master.csv`, `translations_{언어}.csv`, `glossary.csv`). 엑셀이나 버전 관리 도구로 그대로 다룰 수 있습니다.

## 요구 사항

- Windows 10 1809 이상(64비트)
- [Claude Code](https://code.claude.com/docs/en/setup) — 없으면 앱이 처음 켤 때 공식 설치를 안내합니다
- Claude Code 를 쓸 수 있는 계정: Claude Pro·Max 등 구독, 또는 Anthropic Console(API 과금) 계정

## 설치

1. [Releases](../../releases)에서 `BabelAgent-Setup-x.y.z.exe`를 받아 실행합니다.
2. 설치 파일은 아직 코드 서명이 되어 있지 않습니다. Windows 가 "PC 보호" 경고를 띄우면 [추가 정보] → [실행]을 누르세요.
3. 제거는 Windows 설정 → 앱에서 합니다.

### 업데이트

앱은 켤 때와 켜 둔 동안 6시간마다 새 버전을 확인합니다. 새 버전이 있으면 하단 상태바에 알림이 뜹니다. [받기]를 누르면 받기 시작하고, 다 받으면 [다시 시작해 설치]를 누르거나 앱을 끌 때 설치됩니다. 설정 → 앱 업데이트에서도 확인할 수 있습니다.

## 처음 실행

1. **Claude Code 확인**: 앱을 켜면 가운데 창이 Claude Code 를 찾아 최신 버전으로 업데이트합니다. 끝날 때까지 잠시 기다리세요.
   - 설치되어 있지 않으면 [설치]를 누르세요. 새 창에서 Anthropic 의 공식 설치 스크립트(`irm https://claude.ai/install.ps1 | iex`)를 실행합니다. 관리자 권한은 필요 없습니다.
2. **로그인**: 설정 → 계정에서 [Claude 계정(구독)으로 로그인] 또는 [Console(API 과금)로 로그인]을 누릅니다. Claude Code 가 새 창에서 로그인을 진행합니다.
3. **프로젝트 만들기**: [새로 만들기]로 폴더를 고르고 원문·대상 언어를 정합니다. 프로젝트 화면에서 게임 소개와 톤 가이드를 적으면 번역 품질이 좋아집니다.
4. 원문 가져오기 → (컨텍스트·용어집) → 번역 → 검토 → 내보내기 순서로 진행합니다.

## 인증과 요금

- 앱은 로그인 코드·토큰·API 키를 받지도 보관하지도 않습니다. 로그인은 Claude Code 가 처리하고, 앱은 Claude Code 에 로그인한 방식을 그대로 씁니다.
- **구독 계정**: 구독의 사용량 한도 안에서 동작합니다. Anthropic 의 안내에 따르면 Pro·Max 한도는 일반적인 개인 사용을 기준으로 합니다. 큰 배치 번역을 자주 돌리면 한도에 걸릴 수 있으며, 그때 앱은 작업을 멈추고 재설정 시각까지 기다립니다. 남은 한도는 설정 화면에서 봅니다.
- **Console(API 과금)**: 사용량만큼 API 요금이 청구됩니다. 사용량과 요금은 [Claude Console](https://platform.claude.com/)에서 확인하세요.

## Unity 로 가져오기

1. 내보내기 화면에서 언어와 옵션을 고르고 [내보내기]를 누르면 프로젝트 폴더의 `export/`에 CSV 가 생깁니다.
2. Unity 의 Localization Tables 창에서 String Table 컬렉션을 고르고 Import 메뉴의 **CSV(Merge)...** 로 가져옵니다. `CSV...`는 파일에 없는 키를 컬렉션에서 지웁니다.
3. Unity CSV 는 Smart String 여부를 옮기지 않습니다. 함께 쓰인 `{이름}_smart.csv`의 키를 Unity 에서 Smart 로 표시하세요.

자세한 규칙은 [docs/unity-export.md](docs/unity-export.md)에 있습니다.

## 개발

```bash
npm install
npm run dev        # 개발 모드 실행 (Windows 는 run-dev.bat 을 더블클릭해도 됩니다)
npm test           # 단위 테스트(Vitest)
npm run typecheck  # 타입 검사
npm run dist       # 설치 파일 만들기 → dist/ (올리지 않음)
```

릴리스는 `release.bat`을 실행하고 새 버전을 입력하면 됩니다(`release.bat 0.1.1`처럼 바로 넘겨도 됩니다). 커밋하지 않은 변경이 없는지와 원격 상태를 확인하고, 확인을 받은 뒤 typecheck·test 를 돌리고 버전 커밋과 태그를 만들어 올립니다. 태그가 올라가면 GitHub Actions 가 설치 파일을 빌드해 Releases 에 공개하고, 설치된 앱은 그 릴리스를 보고 업데이트를 알립니다.

Node.js 20 이상이 필요합니다. 구조와 규칙은 [CLAUDE.md](CLAUDE.md)와 `docs/`에 있습니다.

- [docs/architecture.md](docs/architecture.md) — 프로세스 경계, IPC 채널, MCP 도구, 작업 스케줄러, 인증과 Claude Code
- [docs/data-format.md](docs/data-format.md) — project.json 과 CSV 열 정의
- [docs/qa-rules.md](docs/qa-rules.md) — QA 검사 규칙
- [docs/unity-export.md](docs/unity-export.md) — Unity 내보내기
- [docs/roadmap.md](docs/roadmap.md) — 마일스톤과 결정 기록

## 라이선스

[MIT](LICENSE). 앱이 쓰는 Claude Agent SDK·Claude Code 와 그 밖의 의존 패키지는 각자의 라이선스와 약관을 따릅니다.

## 알림

Claude 와 Claude Code 는 Anthropic 의 상표입니다. Babel Agent 는 Claude Code 를 실행하는 독립 앱이며 Anthropic 이 만들거나 보증하지 않습니다. 이 앱이 쓰는 Claude Agent SDK 와 Claude Code 는 [Anthropic 의 약관](https://code.claude.com/docs/en/legal-and-compliance)을 따릅니다.
