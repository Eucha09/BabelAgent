# 데이터 포맷

프로젝트는 폴더 하나다. 모든 원본은 이 폴더의 텍스트 파일이며 앱은 캐시만 메모리에 둔다.

```
MyGame/
├ project.json
├ strings_master.csv
├ translations_en.csv
├ translations_ja.csv
├ glossary.csv
├ grammar_ko_particles.csv      (선택)
├ templates/unity_sample.csv    (내보내기 템플릿)
└ .babel/backups/<schemaVersion>-<timestamp>/   (마이그레이션 백업)
```

## project.json

```jsonc
{
  "schemaVersion": 1,
  "name": "My Game",
  "sourceLanguage": "ko",
  "targetLanguages": ["en", "ja"],
  "game": {
    "genre": "",              // 자유 텍스트. 코드는 값을 해석하지 않는다
    "intro": "",              // 게임 소개. 프롬프트 고정 부분에 들어간다
    "toneGuide": ""           // 톤 가이드
  },
  "styleRules": [             // 에이전트 패널에서 누적되는 지속 지시
    { "id": "r1", "text": "NPC 대사는 반말로", "createdAt": "2026-10-19T00:00:00Z" }
  ],
  "batch": { "maxRows": 30, "maxSourceChars": 3000, "concurrency": 2 },
  "smartStrings": {
    "enabled": true,
    "formatters": ["substr", "template", "t", "plural", "p",
                   "choose", "cond", "conditional", "d", "default",
                   "ismatch", "list", "l", "time", "xelement", "isnull"],
    "alternativeEscaping": false,   // Unity의 SmartFormat 설정과 일치시킨다
    "escapeChar": "\\",
    "convertCharacterStringLiterals": false,
    "caseSensitive": true
  },
  "grammar": { "enabled": false, "tables": [] },
  "export": { "unityTemplate": "templates/unity_sample.csv" }
}
```

- 스키마는 `src/shared/schema/project.ts`의 zod로 정의하고 타입은 `z.infer`로 끌어낸다.
- 기본값은 스키마의 `.default()`로 준다. 코드 곳곳에서 `?? 기본값`을 반복하지 않는다.

### Smart Strings 설정

`smartStrings`의 네 값은 Unity 프로젝트의 SmartFormat 설정을 그대로 옮긴 것이어야 한다. 앱이 임의로 고르면 토크나이저가 Unity와 다르게 해석한다. 프로젝트 생성 시 사용자에게 확인받고, 설정 화면에서 수정할 수 있게 한다.

| 필드 | 의미 | QA 영향 |
|---|---|---|
| `alternativeEscaping` | 중괄호 이스케이프 방식 | `true`면 `escapeChar`+`{`가 리터럴, `false`면 `{{`/`}}`가 리터럴 |
| `escapeChar` | 대체 이스케이프 문자. 기본 `\` | `alternativeEscaping`이 `true`일 때만 쓴다 |
| `convertCharacterStringLiterals` | 리터럴 텍스트의 `\n` 같은 문자 이스케이프 해석 여부 | 리터럴 구간의 백슬래시를 이스케이프로 볼지 결정 |
| `caseSensitive` | 이름 비교의 대소문자 구분 | 변수 이름 집합 비교와 포매터 이름 조회에 적용 |

`formatters`는 사용자가 편집하는 목록이다. 기본값은 Localization 패키지 1.x 기준이며 별칭(`template`/`t`, `plural`/`p` 등)을 함께 담는다. 목록에 없는 이름은 경고로만 처리한다 — 상세는 `qa-rules.md`.

### schemaVersion과 마이그레이션

- `schemaVersion`은 1부터 시작하는 정수. 포맷을 바꿀 때만 올린다.
- 마이그레이션은 `src/core/migrate/v{n}_to_v{n+1}.ts` 함수 하나씩. 로더가 현재 버전까지 순차 적용한다.
- 적용 전 프로젝트 폴더를 `.babel/backups/`에 복사한다. 실패 시 백업 경로를 안내한다.
- 앱이 아는 최신 버전보다 파일 버전이 높으면 **열지 않는다**. 하위 호환 추측으로 데이터를 깨뜨리지 않는다.

## strings_master.csv

| 열 | 필수 | 설명 |
|---|---|---|
| `key` | ○ | 고유 식별자. 중복은 로드 시 오류 |
| `source` | ○ | 원문. 언어는 project.json의 `sourceLanguage` |
| `context` | | 상황 설명. 에이전트가 참고하고 추정으로 채울 수 있다 |
| `ui_type` | | `dialogue`/`button`/`tooltip`/`item_name` 등 자유 문자열 |
| `max_len` | | 표시 길이 제한(문자 수). 빈 값은 제한 없음 |
| `vars` | | 변수 메타데이터 JSON 배열(아래) |
| `tags` | | 분류 태그. `;` 구분 |
| `source_hash` | ○ | `source`의 해시 |

- **행 순서는 사용자가 정한 순서를 그대로 보존한다.** 앱은 행을 정렬하지 않는다. 가져오기는 기존 순서를 유지하고 새 키를 뒤에 붙이며, 사용자는 그리드에서 끌어서 놓기나 ↑↓로 순서를 바꾼다.
- **키는 저장한 뒤 바꾸지 않는다.** 번역 파일과 내보내기가 키로 연결된다. 그리드의 키 칸은 읽기 전용이다.
- **행을 지우면 번역도 함께 지운다.** 저장할 때 `strings_master.csv`와 폴더에 있는 모든 `translations_*.csv`(대상 언어 목록에서 빠진 언어 포함)에서 그 키의 행을 지운다. 지울 키는 저장 요청에 `deletedKeys`로 명시하며, "원문에서 빠진 키"로 추론하지 않는다. 저장 전 새 행은 디스크에 없으므로 확인 없이 바로 지운다.
- 번역 파일은 저장 직전에 다시 읽어 고친다(stale 표시·삭제). 앱 밖에서 바뀐 번역을 덮어쓰지 않기 위해서다. 원문은 저장됐는데 번역 파일이 잠겨 실패하면 그 사실을 알리고, 다시 저장하면 이어서 맞춘다.
- 저장 직전 메인이 빈 키와 중복 키를 다시 검사한다. 렌더러를 거치지 않은 요청도 막기 위해서다.
- 새 행의 `source_hash`는 비워 두고 저장할 때 메인이 채운다.

### vars 열

```json
[{ "name": "playerName", "type": "string", "meaning": "플레이어 이름", "example": "바벨" },
 { "name": "count", "type": "int", "meaning": "획득 개수", "example": "3" }]
```

- **변수 이름의 기준은 항상 `source`에서 코드로 재추출한 집합이다.** `vars`는 사람과 에이전트에게 의미를 알려주는 메타데이터일 뿐이다.
- 재추출 집합과 `vars`의 `name` 집합이 다르면 QA 경고를 낸다. 자동으로 고치지 않는다 — 어느 쪽이 맞는지 코드가 알 수 없다.
- 파싱 실패한 `vars`는 빈 배열로 취급하고 경고한다.

## translations_{lang}.csv

| 열 | 필수 | 설명 |
|---|---|---|
| `key` | ○ | strings_master의 key |
| `text` | | 번역문 |
| `source_hash` | ○ | 번역 당시 원문 해시 |
| `status` | ○ | `untranslated`/`draft`/`review`/`approved`/`stale` |
| `confidence` | | 0.0~1.0. 에이전트 보고값 |
| `note` | | 에이전트 메모 또는 검토 메모 |

- master에 없는 key가 있으면 고아 행으로 보고한다. 자동 삭제하지 않는다.
- master에 있고 번역 파일에 없는 key는 로드 시 `untranslated`로 간주한다. 빈 행을 미리 채워 넣지 않는다.

### source_hash 규칙

- 대상은 **원문 텍스트만**. `context`, `ui_type`, `max_len`, `vars`, `tags`는 해시에 넣지 않는다 — 메타데이터를 고칠 때마다 전체가 stale이 되면 쓸 수 없다.
- 정규화는 `\r\n` → `\n` 하나뿐. 공백 trim, 대소문자 변환, 유니코드 정규화는 하지 않는다 — 원문의 공백 차이는 실제 차이다.
- 알고리즘은 SHA-256, 앞 16자(hex)만 저장한다. 함수는 `src/core/hash.ts` 한 곳.

### 상태 전이

```
untranslated ──번역 기록──> draft ──검토 요청──> review ──승인──> approved
     ▲                        │                   │               │
     │                        └───────────────────┴───────────────┘
     │                                  원문 변경(해시 불일치)
     └────────────────────────────────── stale ◀──────────────────┘
                                   재번역/수정 시 draft로 복귀
```

- `stale`이어도 기존 `text`는 보존한다. 사용자가 비교해서 고칠 수 있어야 한다.
- `approved` → 다른 상태는 사용자의 명시적 조작이나 원문 변경으로만 일어난다. 배치 번역은 `approved` 행을 건너뛴다.
- 상태 전이 판정은 `src/core/status.ts`에 모으고 단위 테스트한다.

## glossary.csv

| 열 | 필수 | 설명 |
|---|---|---|
| `term` | ○ | 원문 용어 |
| `translation_{lang}` | | 언어별 확정 번역. 대상 언어마다 한 열 |
| `pos` | | 품사 또는 분류(인명/지명/아이템 등) |
| `note` | | 사용 지침 |
| `strict` | | `true`면 위반을 오류로 올린다. 기본 `false`(경고) |
| `status` | | `approved`/`pending`. 에이전트 제안은 `pending`으로 들어온다 |

## grammar_*.csv (선택)

동적 텍스트 조합이 필요한 프로젝트에서만 쓴다. 파일명은 `grammar_{lang}_{table}.csv`이며 project.json의 `grammar.tables`에 등록된 파일만 읽는다.

한국어 조사 예시(`grammar_ko_particles.csv`):

| 열 | 설명 |
|---|---|
| `id` | 조사 식별자. 예: `topic`, `subject`, `object` |
| `after_consonant` | 받침 있을 때. 예: `은` |
| `after_vowel` | 받침 없을 때. 예: `는` |
| `after_rieul` | ㄹ 받침 예외. 비면 `after_consonant` 사용 |

- 받침 판정은 `src/core/grammar/ko.ts`에 두고 한글 음절 범위(U+AC00~U+D7A3)로 계산한다. 숫자·영문·이모지로 끝나는 경우의 처리 규칙도 테스트로 고정한다.
- 테이블 해석은 언어별 모듈 책임. 열 구성은 언어마다 다를 수 있다.

## 파일 I/O 규칙

- 파서는 `csv-parse`, 생성기는 `csv-stringify`. 다른 CSV 구현을 섞지 않는다.
- 읽기: UTF-8 디코딩을 먼저 시도하고, 치환 문자(U+FFFD)가 나오면 `iconv-lite`로 CP949를 시도한다. CP949로 읽었으면 "이 파일은 CP949로 읽었고 저장 시 UTF-8로 바뀝니다"를 알린다.
- 쓰기: 항상 UTF-8. BOM은 붙이지 않는다. 줄바꿈은 `\n`.
- 쓰기 절차: 같은 폴더에 `.tmp` 파일로 쓰고 `fsync` 후 `rename`으로 교체한다.
- 충돌 감지: 파일을 읽은 시점의 해시를 메모리에 보관하고, 저장 직전 디스크를 다시 읽어 해시를 비교한다. 다르면 대화상자로 "내 변경 유지 / 디스크 내용 다시 불러오기 / 취소"를 묻는다. 조용한 덮어쓰기는 없다.
- 감시: `chokidar`로 프로젝트 폴더를 본다. 미저장 변경이 없으면 자동 리로드, 있으면 알림만 띄우고 사용자 결정을 기다린다.
- 윈도우 파일 잠금(`EBUSY`, `EPERM`)은 메시지에 파일명과 "엑셀 등에서 열려 있는지 확인"을 포함해 안내한다. 재시도는 사용자가 누를 때만.
