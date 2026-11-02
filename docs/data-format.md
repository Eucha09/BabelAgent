# 데이터 포맷

프로젝트는 폴더 하나다. 모든 원본은 이 폴더의 텍스트 파일이며 앱은 캐시만 메모리에 둔다.

```
MyGame/
├ project.json
├ strings_master.csv
├ translations_en.csv
├ translations_ja.csv
├ glossary.csv
├ context_suggestions.csv       (승인을 기다리는 메타데이터 제안)
├ grammar_ko_particles.csv      (선택)
├ templates/unity_template.csv  (선택. Unity에서 내보낸 샘플 CSV — 헤더를 바꾼 Unity 프로젝트용)
├ export/                       (내보내기 출력: {이름}.csv, {이름}_smart.csv, {이름}_chars_{lang}.txt)
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
  "export": {
    "locales": {                // 내보낼 언어(원문 + 대상)마다. 빈 값은 자동(unity-export.md)
      "ko": { "unityLocaleCode": "", "columnName": "" },
      "en": { "unityLocaleCode": "en", "columnName": "English(en)" }
    },
    "sharedComments": false,    // Shared Comments 열을 만들고 context 를 넣는다
    "localeComments": false,    // 언어별 "… Comments" 열을 만들고 번역 메모(note)를 넣는다
    "missing": "empty",         // 번역 없음·stale 칸: empty | source | skip
    "glyphs": false,            // 언어별 글자 목록 파일도 쓴다
    "fileName": "",             // 출력 파일 이름(확장자 제외). 빈 값이면 컬렉션 이름 → 프로젝트 이름
    "unity": null,              // 선택. { "projectPath": "../MyGame", "tableCollection": "UI" }
    "template": null            // 선택. { "path": "templates/unity_template.csv", "columns": [{ "name": "Key", "role": "key" }, …] }
  },
  "translate": { "model": "opus", "effort": "medium" },  // 번역 모델(opus | sonnet | haiku | default=CLI 설정)과 사고 수준(low | medium | high | xhigh | max). 번역 화면·설정 화면에서 고친다
  "review": { "lowConfidence": 0.7 },   // 검토 화면 "신뢰도 낮음" 필터 기준(이 값 미만)
  "context": { "maxLenRatio": 2.5 }     // 컨텍스트 추정이 제안하는 max_len 의 하한 배수. 원문 표시 길이 × 이 값, 최소 10자. 1~10
}
```

- 스키마는 `src/shared/schema/project.ts`의 zod로 정의하고 타입은 `z.infer`로 끌어낸다.
- 사용자는 사이드바의 **프로젝트** 화면에서 고친다(이름·언어·게임 소개·톤 가이드·스타일 규칙·번역·배치·검토 기준·최대 길이 여유 배수·Smart Strings). 여러 칸을 고친 뒤 한 번에 저장하고, 저장하지 않은 채 다른 화면으로 가면 확인을 받는다. 저장할 때는 바뀐 묶음만 보내므로 그 사이 앱 밖에서 고친 다른 묶음은 남는다. 문법 테이블(`grammar`)은 그 기능이 생길 때 화면에 넣는다. 내보내기(`export`)의 언어별 Unity 로케일 코드·열 이름은 이 화면의 "내보내기" 카드에서, 나머지 내보내기 옵션은 내보내기 화면에서 고친다(사용자 결정, 2026-10-26). Unity 프로젝트 경로와 템플릿 경로는 메인의 선택 대화상자로만 정한다.
- 값의 뜻 검증(`validateProjectSettings`, `src/core/project/settings.ts`): 이름은 비울 수 없고, 언어 코드는 BCP 47 태그여야 하며 대상 언어는 겹치거나 원문 언어와 같을 수 없다. 배치 행 수·글자 수는 1 이상 정수, 동시 작업자는 1~3, 신뢰도 기준은 0~1, 최대 길이 여유 배수는 1~10, `escapeChar`는 중괄호가 아닌 글자 하나, 포매터 이름은 영문·숫자·`_`. 내보내기 로케일 코드는 비우거나 BCP 47 태그, 열 이름은 비우거나 앞뒤 공백 없는 문자열이고 겹칠 수 없다.
- 스타일 규칙 id 는 `r` + 번호(`r1`, `r2` …)로 새로 붙이고 한 번 붙인 id 는 바꾸지 않는다. 프롬프트가 id 순으로 넣으므로 id 가 바뀌면 고정 부분이 바뀐다(캐싱).
- 기본값은 스키마의 `.default()`로 준다. 코드 곳곳에서 `?? 기본값`을 반복하지 않는다.
- 옛 파일의 `export.unityTemplate`(문자열)은 읽을 때 `export.template.path`로 옮긴다(매핑은 다시 추론). 템플릿이 필수에서 선택으로 바뀐 것이라 `schemaVersion`은 올리지 않는다.

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
| `context` | | 상황 설명. 에이전트가 참고한다. 컨텍스트 화면에서 에이전트 제안을 승인해 채울 수 있다 |
| `ui_type` | | `dialogue`/`button`/`tooltip`/`item_name` 등 자유 문자열 |
| `max_len` | | 표시 길이 제한(문자 수). 빈 값은 제한 없음 |
| `vars` | | 변수 메타데이터 JSON 배열(아래) |
| `tags` | | 분류 태그. `;` 구분 |
| `smart` | | Unity Smart String 여부. `true`/`false`/빈 값(미정) |
| `source_hash` | ○ | `source`의 해시 |

- **행 순서는 사용자가 정한 순서를 그대로 보존한다.** 앱은 행을 정렬하지 않는다. 가져오기는 기존 순서를 유지하고 새 키를 뒤에 붙이며, 사용자는 그리드에서 끌어서 놓기나 ↑↓로 순서를 바꾼다.
- **키는 저장한 뒤 바꾸지 않는다.** 번역 파일과 내보내기가 키로 연결된다. 그리드의 키 칸은 읽기 전용이다.
- **행을 지우면 번역도 함께 지운다.** 저장할 때 `strings_master.csv`와 폴더에 있는 모든 `translations_*.csv`(대상 언어 목록에서 빠진 언어 포함)에서 그 키의 행을 지운다. 지울 키는 저장 요청에 `deletedKeys`로 명시하며, "원문에서 빠진 키"로 추론하지 않는다. 저장 전 새 행은 디스크에 없으므로 확인 없이 바로 지운다.
- 번역 파일은 저장 직전에 다시 읽어 고친다(stale 표시·삭제). 앱 밖에서 바뀐 번역을 덮어쓰지 않기 위해서다. 원문은 저장됐는데 번역 파일이 잠겨 실패하면 그 사실을 알리고, 다시 저장하면 이어서 맞춘다.
- 저장 직전 메인이 빈 키와 중복 키를 다시 검사한다. 렌더러를 거치지 않은 요청도 막기 위해서다.
- 새 행의 `source_hash`는 비워 두고 저장할 때 메인이 채운다.

### smart 열

- Unity의 Smart 플래그는 CSV로 옮겨지지 않는다. 내보내기가 `smart=true` 행 목록을 따로 보여주고 파일로 쓴다(`unity-export.md`).
- 원문 화면은 토크나이저(project.json `smartStrings` 설정)가 원문에서 플레이스홀더를 찾았는데 `smart`가 비어 있는 행에 `true`를 제안한다. 적용은 사용자가 한다(미저장 편집 → 저장). `false`로 둔 행은 제안하지 않는다. `true`인데 구문이 없는 행은 그대로 둔다.
- 값은 대소문자를 무시하고 `true`/`false`로 읽고, 그 밖의 값은 미정으로 본다. 다른 열처럼 칸의 글자는 그대로 들고 다닌다(읽을 때 바꿔 쓰지 않는다). 앱이 값을 정할 때는 소문자로 쓴다.
- 메타데이터라 원문 해시에 들어가지 않는다. 선택 열이라 옛 파일도 그대로 읽히므로 `schemaVersion`은 올리지 않는다.

### vars 열

```json
[{ "name": "playerName", "type": "string", "meaning": "플레이어 이름", "example": "바벨" },
 { "name": "count", "type": "int", "meaning": "획득 개수", "example": "3" }]
```

- **변수 이름의 기준은 항상 `source`에서 코드로 재추출한 집합이다.** `vars`는 사람과 에이전트에게 의미를 알려주는 메타데이터일 뿐이다.
- 재추출 집합과 `vars`의 `name` 집합이 다르면 QA 경고를 낸다. 자동으로 고치지 않는다 — 어느 쪽이 맞는지 코드가 알 수 없다. `vars`가 빈 칸이면 비교하지 않는다.
- 파싱 실패한 `vars`는 빈 배열로 취급하고 경고한다(`var.meta_invalid`).
- 원문 화면에서 JSON 그대로 고칠 수 있고, 컨텍스트 화면에서 에이전트 제안(변수마다 type·meaning·example)을 승인해 채울 수 있다.
- 스키마는 `src/shared/schema/strings.ts`의 `VarMeta`. `example`이 숫자로 적혀 있어도 문자열로 받는다(엑셀이 숫자로 바꿔 저장하는 경우).

## translations_{lang}.csv

| 열 | 필수 | 설명 |
|---|---|---|
| `key` | ○ | strings_master의 key |
| `text` | | 번역문 |
| `source_hash` | ○ | 번역 당시 원문 해시 |
| `status` | ○ | `untranslated`/`draft`/`review`/`approved`/`stale` |
| `confidence` | | 0.0~1.0. 에이전트 보고값. 사람이 번역문을 고치면 비운다 |
| `note` | | 에이전트 메모 또는 검토 메모 |
| `source_snapshot` | | 번역을 기록할 때 본 원문. stale 행에서 이전 원문과 새 원문의 차이를 보여 준다 |

- master에 없는 key가 있으면 고아 행으로 보고한다. 자동 삭제하지 않는다.
- master에 있고 번역 파일에 없는 key는 로드 시 `untranslated`로 간주한다. 빈 행을 미리 채워 넣지 않는다.

### source_snapshot 열

- 배치 기록·검토 화면 저장·재번역 후보 적용 때 그 시점의 원문을 `source_hash`와 함께 남긴다. 원문이 바뀌어 stale이 되어도 두 값은 그대로 둔다 — 그 번역이 어느 원문을 보고 쓴 것인지가 남아야 하기 때문이다.
- 해시만으로는 이전 원문을 되살릴 수 없어서 추가한 열이다. 앱 밖 저장소(`.babel/` 캐시)에 두지 않고 번역 파일에 둔 이유: CSV가 원본이라는 원칙을 지키고, 앱이 보지 못한 사이 원문이 바뀌어도 번역 행이 스스로 근거를 갖는다(사용자 결정, 2026-10-21).
- 읽을 때 `sourceHash(source_snapshot) === source_hash`인지 확인하고, 다르면(앱 밖에서 한쪽만 고친 경우) 믿지 않고 비운다. 해시는 메인에서만 계산하므로 렌더러에 넘기기 전에 메인이 거른다.
- 이 열이 생기기 전에 쓴 번역은 비어 있고, 검토 화면은 "이전 원문 기록 없음"으로 보여 준다. 선택 열이라 옛 파일도 그대로 읽히므로 `schemaVersion`은 올리지 않았다.

### source_hash 규칙

- 대상은 **원문 텍스트만**. `context`, `ui_type`, `max_len`, `vars`, `tags`, `smart`는 해시에 넣지 않는다 — 메타데이터를 고칠 때마다 전체가 stale이 되면 쓸 수 없다.
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
- 상태 전이 판정은 `src/core/status.ts`에 모으고 단위 테스트한다. 배치 기록(→ draft)은 `src/core/translate/merge.ts`, 원문 변경(→ stale)은 `src/core/strings/stale.ts`가 맡는다.

검토 화면에서 사람이 고칠 때(`applyManualUpdate`):

- 번역문을 고치면 초안이 된다. 비우면 미번역이 된다. 빈 번역을 다른 상태로 둘 수 없고, 번역문이 있는 행을 미번역으로 둘 수도 없다.
- `stale`은 사람이 고르는 상태가 아니다. stale 행의 메모만 고치면 stale로 남는다.
- 번역문이나 상태를 바꾸면 "지금 원문을 보고 판단했다"는 뜻이므로 `source_hash`와 `source_snapshot`을 지금 원문에 맞춘다. stale 행을 번역문 그대로 검토·승인하면 옛 번역이 새 원문에도 맞다고 확인한 것이다.
- 메모만 고치면 해시를 건드리지 않는다.
- QA 오류가 있는 행은 승인할 수 없다(메인이 막는다).
- 재번역 후보를 적용하면 번역문·신뢰도·메모를 후보 값으로 바꾸고 초안으로 둔다. 승인된 행이면 확인을 받는다.

일괄 승인(`src/core/review/bulk.ts`):

- 대상은 검토 화면에 지금 보이는 행(필터·검색 적용) 중 상태가 `draft`이고, 번역문이 있고, QA 오류·경고가 하나도 없고, 신뢰도가 `review.lowConfidence` 이상인 행이다. 신뢰도가 비어 있는 행(사람이 고친 초안)은 낮은 것으로 보지 않는다 — "신뢰도 낮음" 필터와 같은 기준이다.
- 확인 대화상자에서 행 수와 키를 보여 주고 승인한다. 메인은 번역 파일을 다시 읽어 행마다 같은 조건을 다시 확인하고, 화면이 본 뒤 바뀐 행은 건너뛴다. 통과한 행만 모아 한 번에 원자적으로 쓴다.
- 한 번에 되돌리는 기능은 없다. 행마다 [초안]·[검토]로 되돌린다.

### 동시 편집

- 검토 화면은 행 단위로 바로 저장한다. 번역 파일을 다시 읽고, 디스크의 그 행이 편집을 시작할 때 본 것(번역문·상태)과 다르면 충돌 대화상자를 띄운다. 다른 행이 앱 밖에서 바뀐 것은 다시 읽은 내용에 그대로 남는다(사용자 결정, 2026-10-21). 파일 해시 전체 비교보다 좁지만, 배치 작업이 같은 파일을 계속 쓰는 동안에도 검토할 수 있다.
- 배치 작업은 시작할 때 대상 행의 상태(번역문·상태)를 기억해 두고, 기록할 때 그 사이 사람이 고친 행은 덮지 않는다(작업 로그에 남긴다).

## glossary.csv

| 열 | 필수 | 설명 |
|---|---|---|
| `term` | ○ | 원문 용어 |
| `translation_{lang}` | | 언어별 확정 번역. 대상 언어마다 한 열 |
| `pos` | | 품사 또는 분류(인명/지명/아이템 등) |
| `note` | | 사용 지침 |
| `strict` | | `true`면 위반을 오류로 올린다. 기본 `false`(경고) |
| `status` | | `approved`/`pending`. 에이전트 제안은 `pending`으로 들어온다. 비어 있으면 사람이 직접 쓴 용어로 보고 `approved`로 친다. 그 밖의 값은 승인 전으로 본다 |
| `pending_languages` | | 승인된 용어에서 아직 승인을 기다리는 언어. `;`로 구분(읽을 때는 `,`·공백도 받는다). 용어 번역 작업이 승인된 용어의 빈 칸을 채우면 그 언어가 들어가고, [선택 승인]이 지운다. 이 언어의 번역은 번역 프롬프트와 QA 에 쓰지 않는다. 승인 대기(`pending`) 용어에서는 쓰지 않는다 |
| `reason` | | 에이전트가 후보로 낸 근거. 사람이 추가한 용어는 비어 있다 |
| `confidence` | | 에이전트가 보고한 신뢰도(0~1). 화면에서 `review.lowConfidence` 미만이면 구분 표시 |

- **용어는 대소문자를 무시하고 유일하다.** 용어집 화면과 추출 작업이 용어로 행을 찾는다. 파일에 같은 용어가 여러 행이면 첫 행만 화면에서 고칠 수 있고, 그 사실을 알린다.
- 승인된 용어만 번역 프롬프트와 QA 에 쓰인다. 그 언어가 `pending_languages`에 있으면 번역은 빼고 지침만 쓴다. 확정 번역도 사용 지침(`note`)도 없는 용어는 프롬프트에 넣지 않는다.
- 용어 추출은 후보만 넣는다(번역 칸은 빈다). 번역은 용어집 화면의 [용어 번역]이 **빈 칸만** 채운다 — 대상 언어를 늘리면 새 언어 열만 채우면 된다(사용자 결정, 2026-11-02).
- 쓸 때는 있던 열 순서와 사용자가 더한 열을 그대로 두고, 빠진 대상 언어 열은 마지막 번역 열 뒤에, 빠진 표준 열은 끝에 붙인다(`src/core/glossary/entries.ts`). 손대지 않은 칸은 원래 표기를 지킨다 — 빈 `status`를 `approved`로, 빈 `strict`를 `false`로 바꿔 쓰지 않는다.
- 용어집 화면은 고친 행만 보낸다. 메인이 파일을 다시 읽어 행마다 화면이 본 값과 비교하고, 그 사이 바뀐 행(추출 작업·앱 밖 편집)은 덮지 않고 건너뛴다. 그래서 추출 작업이 도는 중에도 편집할 수 있다.
- 용어집 화면의 [용어 추가]는 에이전트가 채운다: 원문에서 그 용어가 쓰인 행을 코드가 찾아 예문으로 주고, 대상 언어별 번역과 사용자가 비운 품사·지침을 채워 `pending`으로 붙인다(사용자 결정, 2026-10-26). 원문에 없는 용어는 추가하지 않는다. 사람이 직접 번역을 적어 넣는 길은 그리드 편집이다.
- 후보는 다시 읽기 → 합치기 → 원자적 쓰기로 붙는다. 이미 있는 용어(승인 대기 포함)와 같은 후보는 넣지 않는다 — 병렬 배치가 같은 용어를 내면 먼저 기록한 쪽만 남는다.

## context_suggestions.csv

컨텍스트 추정 작업이 낸 메타데이터 제안. 사람이 컨텍스트 화면에서 고치고 승인한 행만 strings_master.csv 에 들어간다. 앱을 다시 켜도 제안이 남도록 프로젝트 폴더의 CSV 로 둔다(사용자 결정, 2026-10-22).

| 열 | 설명 |
|---|---|
| `key` | 원문 키 |
| `source_hash` | 제안할 때 본 원문의 해시. 지금 원문과 다르면 "원문 변경"으로 표시하고 일괄 선택에서 뺀다 |
| `context` · `ui_type` · `max_len` · `vars` | 제안 값. 빈 칸은 그 필드를 제안하지 않았다는 뜻이다 — 에이전트는 고른 필드 중 원문에서 비어 있는 칸만 채운다. `max_len`은 원문 표시 길이 × `context.maxLenRatio`(최소 10자) 아래면 코드가 그 값으로 올려서 담는다 |
| `confidence` | 행 전체에 대한 신뢰도(0~1) |
| `note` | 추정 근거·불확실한 점. 원문 언어로 쓴다 |

- 키마다 한 행. 다시 추정하면 같은 키의 제안을 새 제안으로 바꾼다. 승인을 기다리는 제안이 있는 행은 추정 대상에서 빠진다(다시 실행하면 남은 행만 돈다).
- `vars` 의 이름은 코드가 원문에서 뽑아 프롬프트에 주고, 제출된 이름 집합이 그와 같아야 받는다. 원문 표기와 순서로 JSON 배열을 만든다.
- 적용: 사람이 고친 값으로 원문 행의 그 칸을 채운다. 비운 칸은 적용하지 않는다. 화면이 본 뒤 원문 칸이 바뀌었으면 그 행은 건너뛴다. `max_len`은 양의 정수, `vars`는 vars 열 형식이어야 한다. 적용한 행의 제안은 파일에서 지운다.
- 메타데이터는 원문 해시에 들어가지 않으므로 적용해도 번역이 stale 이 되지 않는다.

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
