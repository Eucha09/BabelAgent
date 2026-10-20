# QA 규칙

구현은 `src/core/qa/`. 모든 규칙은 단위 테스트를 가진다. 각 검사는 `{ ruleId, severity, key, message, detail }` 진단을 낸다.

`error`는 내보내기를 막고, `warning`은 막지 않는다.

## 검사 목록

| ruleId | 심각도 | 내용 |
|---|---|---|
| `var.missing` | error | 원문에 있는 변수가 번역문에 없음 |
| `var.extra` | error | 번역문에 원문에 없는 변수가 있음 |
| `var.meta_mismatch` | warning | `vars` 열의 name 집합이 원문 재추출 집합과 다름 |
| `smart.brace_unbalanced` | error | 중괄호 짝이 맞지 않음 |
| `smart.unknown_formatter` | warning | `smartStrings.formatters`에 없는 포매터 이름 |
| `tag.set_mismatch` | error | 리치 텍스트 태그 집합이 원문과 다름 |
| `tag.unclosed` | error | 닫히지 않은 태그 또는 짝이 어긋난 중첩 |
| `len.over_max` | error | `max_len` 초과 |
| `text.empty` | error | 상태가 `untranslated`가 아닌데 번역문이 빔 |
| `glossary.violation` | warning | 용어의 확정 번역이 번역문에 없음 |
| `glossary.violation_strict` | error | 위 조건 + 용어의 `strict`가 `true` |
| `status.stale` | warning | `source_hash` 불일치 |

## 변수

- 비교는 **집합**이다. 순서와 등장 횟수는 보지 않는다 — 언어마다 어순이 다르고 반복 횟수도 달라질 수 있다.
- 기준 집합은 검사 시점에 원문에서 재추출한다. `vars` 열을 신뢰하지 않는다.
- 추출 대상:
  - 이름 플레이스홀더: `{playerName}`
  - 인덱스 플레이스홀더: `{0}`, `{1}`
  - 포매터가 붙은 형태에서는 선택자(이름/인덱스)만 취한다. `{count:plural:one|other}` → `count`
- **빈 플레이스홀더 `{}`는 집합에서 제외한다.** 이름이 없어 대조할 대상이 없고, 번역문에서 개수가 달라질 수 있다. 다만 구문 오류는 아니므로 중괄호 짝 검사 대상에는 포함한다.
- 이름 비교는 `smartStrings.caseSensitive`를 따른다. `false`면 소문자로 정규화해 비교한다.
- 이스케이프된 중괄호는 변수가 아니다. 판정은 `smartStrings`의 이스케이프 설정을 따른다(아래).

## Smart Strings 토크나이저

`src/core/qa/smart.ts`. 범용 파서를 만들지 않고 검증에 필요한 만큼만 토큰화한다.

파싱 결과 토큰: `literal`, `placeholder { selector, formatter?, options?, body? }`.

### 이스케이프

- `smartStrings.alternativeEscaping`이 `false`면 `{{`, `}}`를 리터럴 중괄호로 본다.
- `true`면 `escapeChar`(기본 `\`) + `{`/`}`를 리터럴로 본다. 이 모드에서는 `{{`를 이스케이프로 처리하지 않는다.
- `convertCharacterStringLiterals`가 `true`면 리터럴 구간의 `\n`, `\t` 같은 시퀀스를 문자 이스케이프로 해석한다. `false`면 백슬래시를 평범한 문자로 둔다.
- 이 세 값을 코드 상수로 박지 않는다. 프로젝트마다 Unity 설정이 다르다.

### 포매터 이름 판정

`{선택자:...}`의 콜론 뒤는 포매터 이름일 수도 있고 이름이 생략된 선택지 목록일 수도 있다. 판정 규칙:

- 콜론 직후부터 `(` 또는 다음 `:`까지가 식별자 문자(영문·숫자·`_`)로만 이뤄져 있으면 **포매터 이름**으로 본다.
- 그 범위에 `|`, 공백, `{` 등 식별자가 아닌 문자가 섞이면 **이름 생략**으로 본다.

고정 테스트 케이스:

| 입력 | 해석 |
|---|---|
| `{count:plural:one\|other}` | 포매터 `plural` |
| `{0:choose(1\|2):a\|b}` | 포매터 `choose` |
| `{0:a\|b\|c}` | 이름 생략. 정상 구문이며 경고도 내지 않는다 |
| `{name}` | 포매터 없음 |
| `{}` | 빈 플레이스홀더. 변수 집합에서 제외 |

### 검사하는 것

1. **중괄호 짝** — 여는/닫는 괄호 수와 중첩 깊이. 불균형은 `error`.
2. **변수 이름 집합** — 이름과 인덱스를 모두 포함한 집합이 원문과 동일해야 한다. `error`.
3. **포매터 이름** — `smartStrings.formatters`에 없으면 `warning`.

### 검사하지 않는 것

- **포매터 구성이 원문과 달라도 허용한다.** 원문이 `{count:plural:one|other}`인데 번역이 `{count:plural:one|few|many|other}`여도 정상이다. 언어마다 필요한 분기 수가 다르다.
- 선택지 안쪽 텍스트의 내용. 사람이 검토한다.
- 포매터 이름 생략 여부. 원문과 달라도 무시한다.

### 포매터 목록

- 목록은 project.json의 `smartStrings.formatters`에 있고 사용자가 편집한다. 코드의 기본값은 `src/core/qa/formatters.ts` 상수이며, 프로젝트에 값이 있으면 그 값을 쓴다.
- 기본값은 Localization 패키지 1.x 기준이고 별칭을 포함한다.
  - 확인된 이름: `substr`, `template`/`t`, `plural`/`p`
  - 확정 대기 후보: `choose`, `cond`/`conditional`, `d`/`default`, `ismatch`, `list`/`l`, `time`, `xelement`, `isnull`
  - 후보는 Unity 쪽에서 확인한 뒤 확정한다. 확정 전까지 목록에 두되 코드 주석에 "확인 대기"로 표시한다.
- 과거 후보였던 `sub`는 잘못된 이름이다. `substr`을 쓴다.
- 목록에 없는 이름은 `error`가 아니라 `warning`이다 — 커스텀 포매터를 등록한 프로젝트에서 오탐이 되면 QA 전체를 신뢰할 수 없게 된다.
- 이름 조회는 `smartStrings.caseSensitive`를 따른다.

### 후순위 과제

- 언어별 복수형 분기 개수 검사(CLDR 복수 규칙과 `plural` 선택지 수 대조). 지금은 하지 않는다 — 오탐이 많고 Unity 쪽 동작 확인이 먼저 필요하다.

## 리치 텍스트 태그

- 대상은 TextMeshPro 스타일 태그. `<b>`, `<i>`, `<color=#RRGGBB>`, `<size=120%>`, `<sprite=3>`, `<link="id">` 등.
- 비교 단위는 **태그 이름 + 속성값**의 집합이다. `<color=#ff0000>`과 `<color=#00ff00>`은 다른 태그로 본다 — 색이 바뀌면 의도가 바뀐 것이다.
- 닫는 태그는 이름만으로 짝을 맞춘다. 짝이 없거나 중첩 순서가 어긋나면 `tag.unclosed`.
- 꺾쇠가 들어간 일반 텍스트(`a < b`)를 태그로 오인하지 않도록, 알려진 태그 이름 목록에 있는 것만 태그로 인식한다. 목록은 `src/core/qa/tags.ts`.

## 길이

- `max_len`은 문자 수 기준. 셈은 코드 포인트가 아니라 **그래프임 클러스터** 단위로 센다(`Intl.Segmenter`). 이모지와 조합 문자가 1로 세어져야 한다.
- 변수 플레이스홀더는 치환 후 길이를 알 수 없으므로 `vars`의 `example` 값으로 치환해 계산하고, `example`이 없으면 플레이스홀더 길이를 그대로 센다. 이 가정을 진단 메시지에 함께 보여준다.

## 용어집

### 원문에서 용어 탐지

- 대소문자 무시, 단어 경계 기준. 긴 용어를 먼저 매칭한다("fire sword"가 "sword"보다 우선).
- 단어 경계가 없는 언어(한국어·일본어·중국어)는 부분 문자열 매칭을 쓴다.

### 번역문 준수 확인

- 기본: 해당 언어의 확정 번역 문자열이 번역문에 포함되어 있는지 본다.
- 한국어 대상: 조사가 붙으므로 **어절 앞부분 일치**로 판정한다. 번역문을 공백으로 나눈 각 어절이 확정 번역으로 시작하면 통과("바벨탑을" ← "바벨탑").
- 확정 번역이 비어 있는 용어는 검사하지 않는다.
- 결과는 기본 `warning`. 용어의 `strict`가 `true`면 `error`.
- `status: pending` 용어는 검사하지 않는다.

## 실행 시점

- 배치 결과 병합 전(오류 있으면 배치 전체 거부)
- 사용자가 행을 수동 편집한 직후(해당 행만)
- `qa:run`으로 선택 범위 일괄 실행
- 내보내기 직전(전체). 오류가 있으면 내보내기를 중단하고 해당 행으로 이동할 수 있게 목록을 보여준다.
