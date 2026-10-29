# Unity Localization 내보내기

## 원칙

- **기본은 템플릿 없이 자동 생성한다.** Unity Localization CSV 확장의 기본 열 구성을 그대로 만든다. 사용자가 Unity에서 샘플을 먼저 내보내지 않아도 된다.
- Unity 프로젝트 연결과 템플릿 등록은 **선택 기능**이다. 둘 다 없거나 읽지 못해도 자동 생성으로 내보낼 수 있어야 한다.
- 로케일 코드와 열 이름은 코드에 박지 않는다. 언어마다 project.json의 `export.locales`에 두고 사용자가 프로젝트 화면의 "내보내기" 카드에서 고친다. 빈 값이면 아래 규칙으로 자동으로 채운다.
- 내보내기 전에 만들어질 헤더를 미리 보여준다. 열 이름이 하나라도 다르면 Unity가 그 열을 조용히 무시하기 때문이다(아래 "Unity 가져오기 동작").
- Babel Agent 내부 열(`status`, `confidence`, `note`, `source_hash`, `smart` 등)은 그대로 내보내지 않는다 — Unity가 모르는 열이다.

## Unity 가져오기 동작 (확인한 사실)

Localization 1.5.13(`Editor/Plugins/CSV`) 원본과 실제 Unity 6000.4 프로젝트 파일로 확인했다(2026-10-26). 패키지 버전이 바뀌면 다시 확인한다.

- 기본 열 구성(`ColumnMapping.CreateDefaultMapping`): `KeyIdColumns`(`Key`, `Id`, `Shared Comments`) 다음에 프로젝트 로케일마다 `LocaleColumns` 하나.
- 로케일 값 열 이름은 `LocaleIdentifier.ToString()` = `{CultureInfo.EnglishName}({코드})`다. 예: `English(en)`, `Korean(ko)`, `Chinese (Simplified)(zh-Hans)`. CultureInfo를 찾지 못하는 코드는 `Custom({코드})`. 로케일 에셋의 표시 이름(`m_LocaleName`, 예: `English (en)`)은 **헤더에 쓰이지 않는다.**
- 로케일 주석 열 이름은 값 열 이름 + ` Comments`다. 예: `English(en) Comments`.
- 가져오기는 헤더 **이름이 정확히 같은 열**만 읽는다. 이름이 다른 열은 오류 없이 무시된다. 로케일 열은 그 컬렉션에 해당 로케일 테이블이 있을 때만 적용된다.
- `Id`가 비었거나 `0`이면 `Key`로 기존 항목을 찾고, 없으면 새 항목을 만들며 새 Id를 붙인다. Id가 있고 그 Id의 항목이 있으면 키 이름을 `Key` 값으로 바꾼다. Id가 있는데 항목이 없으면 그 Id로 새 항목을 만든다.
- 값 칸이 비어 있으면 그 로케일의 기존 번역을 **빈 문자열로 덮는다.** `Shared Comments`·`… Comments` 칸이 비어 있으면 기존 주석을 **지운다.** 열 자체가 없으면 건드리지 않는다.
- `Import > CSV...`는 파일에 없는 키를 컬렉션에서 **지운다**(`removeMissingEntries = true`). `Import > CSV(Merge)...`는 남겨 둔다.
- Smart 여부는 CSV에 없다. Unity는 로케일 테이블마다 항목 메타데이터(`SmartFormatTag`)로 저장한다.
- Unity에는 런타임 의사 로컬라이제이션(`PseudoLocale`)이 있다. 원문 테이블 값을 포맷한 뒤 변환한다. 그래서 Babel Agent는 의사 로컬라이제이션 파일을 만들지 않는다 — Unity의 Pseudo-Locale을 쓴다(사용자 결정, 2026-10-26).
- `CultureInfo.EnglishName`은 Unity의 Mono 문화권 데이터를 따른다. 브라우저·Node의 영어 이름(CLDR)과 다른 코드가 있다: `zh-CN`→`Chinese (Simplified)`, `zh-TW`→`Chinese (Traditional)`, `zh-HK`→`Chinese (Traditional, Hong Kong SAR China)`, `zh`→`Chinese (Simplified)`, `cs-CZ`→`Czech (Czech Republic)`, `tr-TR`→`Turkish (Turkey)` 등. 그래서 이름표는 Unity Editor의 Mono에서 뽑은 값을 쓴다(아래).

## 자동 생성 헤더

열 순서:

1. `Key`
2. `Id`
3. `Shared Comments` — 옵션을 켰을 때만. 값은 `strings_master.csv`의 `context`
4. 내보낼 언어마다(원문 언어 → 대상 언어 순):
   - 값 열 `{언어명}({로케일 코드})`
   - 주석 열 `{값 열 이름} Comments` — 옵션을 켰을 때만. 값은 번역 행의 `note`(원문 언어 열은 비움)

언어별 값(`export.locales.{언어}`):

| 필드 | 빈 값일 때 |
|---|---|
| `unityLocaleCode` | Unity 프로젝트를 연결했고 맞는 로케일이 있으면 그 코드, 없으면 프로젝트 언어 코드 그대로 |
| `columnName` | `{EnglishName(unityLocaleCode)}({unityLocaleCode})`. 이름표에 없는 코드는 마지막 하위 태그를 떼어 가며 다시 찾고(`es-419`→`es`, `zh-Hans-CN`→`zh-Hans`), 끝내 없으면 `Custom({코드})` |

- 이름표는 Unity Editor(6000.4.10f1)의 Mono `CultureInfo.GetCultures(AllCultures)`에서 뽑은 `코드 → EnglishName` 표(341개, `src/core/export/unity-locale-names.ts`)다. 뽑은 Unity 버전을 주석에 남긴다. 코드는 대소문자를 무시하고 찾고, 열 이름에는 사용자가 적은 코드 표기를 그대로 쓴다.
- 표에 없는 코드의 처리도 같은 Mono 로 확인했다: `es-419`·`en-XA`·`en-001`은 `Spanish`·`English`(상위 언어), `zh-Hans-CN`은 `Chinese (Simplified)`, `pseudo`·`qps-ploc`는 CultureInfo가 없어 `Custom`.
- 사용자가 `columnName`을 직접 적으면 그 값이 가장 앞선다(Unity 쪽에서 열 이름을 바꾼 경우).
- 주석 열 옵션을 끄면 열을 아예 만들지 않는다. 빈 칸으로 두면 Unity의 기존 주석이 지워진다.
- 열 이름이 겹치거나 비면 내보내기를 막는다.
- 미리보기는 열마다 이름과 출처(자동 · 설정 · Unity · 템플릿)를 보여준다. 처음 한 번은 Unity에서 내보낸 CSV의 헤더와 눈으로 비교하라고 안내한다.

## Unity 프로젝트 연결 (선택)

Unity 프로젝트 폴더를 연결하면 그 안의 에셋을 **읽기만** 해서 실제 로케일 코드와 기존 키의 Id를 가져온다. Unity 프로젝트에 쓰지 않는다.

- 폴더는 메인 프로세스의 폴더 선택 대화상자로만 고른다. `Assets/`와 `ProjectSettings/`가 있어야 Unity 프로젝트로 본다. project.json `export.unity.projectPath`에 프로젝트 폴더 기준 상대 경로로 저장한다(드라이브가 다르면 절대 경로).
- `Assets/` 아래 `.asset` 파일을 훑어 앞부분으로 종류를 가린 뒤 YAML로 읽는다. 필드 이름은 실제 파일로 확인했다:
  - 로케일 에셋: `MonoBehaviour.m_Identifier.m_Code`(코드), `m_LocaleName`(표시 이름), `m_SortOrder`
  - String Table 공유 데이터 에셋(`… Shared Data.asset`): `m_TableCollectionName`, `m_Entries[]`의 `m_Id`·`m_Key`
  - 참고(읽지 않음): 컬렉션 에셋은 `m_SharedTableData`·`m_Tables`·`m_Extensions`(CSV 확장의 사용자 열 이름이 여기 있다), 로케일 테이블은 `m_LocaleId.m_Code`·`m_TableData[]`의 `m_Id`·`m_Localized`
- YAML은 모든 값을 문자열로 읽는다. `m_Id`는 64비트 정수라 JS 숫자로 바꾸면 자리가 깨지고, `m_Key: No`·`007` 같은 키가 불리언·숫자로 바뀌면 안 된다.
- 공유 데이터가 여러 개면 사용자가 컬렉션(`m_TableCollectionName`)을 고르고 `export.unity.tableCollection`에 저장한다.
- 로케일 맞추기: 프로젝트 언어마다 Unity 로케일 코드를 대소문자 무시 일치 → 기본 언어가 같은 로케일이 하나뿐이면 그것 순으로 찾는다. 못 찾으면 경고하고 설정값을 쓴다.
- Id: 내보내는 키와 같은 `m_Key`가 공유 데이터에 있으면 그 `m_Id`를 쓰고, 없으면 비운다(새 키).
- 요약에 Id를 찾은 키 수, 새 키 수, **Unity에만 있는 키 수**를 보여준다. Unity에만 있는 키는 `Import > CSV...`로 가져오면 지워지므로 `CSV(Merge)...`를 권한다.
- 읽기에 실패하면(폴더 없음, 바이너리 직렬화, YAML 오류, 고른 컬렉션 없음) **자동 생성으로 대신하고** 이유를 보여준다. 내보내기를 막지 않는다. 이때 Id는 모두 비운다.
- NavMesh·LightingData 처럼 Unity 가 늘 바이너리로 두는 에셋은 건너뛰고 개수만 알린다. 텍스트 에셋이 하나도 없으면 Asset Serialization 을 Force Text 로 바꾸라고 안내한다.
- 읽은 결과는 메인이 들고 있고, 연결할 때와 [다시 읽기]를 누를 때만 다시 훑는다(미리보기마다 Assets 를 훑지 않는다). Unity 에서 키·로케일을 바꿨으면 [다시 읽기]를 누른다.

## 템플릿 (선택)

Unity 쪽 CSV 확장에서 열 이름이나 구성을 바꾼 프로젝트를 위한 기능이다. 등록하지 않으면 자동 생성을 쓴다.

- 템플릿은 Unity에서 내보낸 CSV다. 메인의 파일 선택 대화상자로 고르고, 프로젝트 폴더의 `templates/`로 복사해 상대 경로를 `export.template.path`에 저장한다.
- 첫 줄(헤더)만 읽어 열마다 역할을 추론한다:
  - `key` · `id` · `sharedComments`: Unity 기본 이름(`Key`, `Id`, `Shared Comments`)과 같은 열
  - `value`(언어): 자동 생성 열 이름과 같거나 `…(코드)` 꼴이고 그 코드가 프로젝트 언어의 로케일 코드와 맞는 열
  - `comments`(언어): 위 값 열 이름 + ` Comments`
  - 추론하지 못한 열은 `omit`(내보내지 않음)으로 두고 경고한다. 추측으로 채우지 않는다. 빈 칸으로 두지 않는 이유: Unity는 빈 칸을 받으면 그 열의 기존 값을 지운다
- 추론 결과를 화면에서 고칠 수 있고, 매핑은 `export.template.columns`에 저장해 다음 내보내기부터 쓴다. 템플릿 헤더가 저장된 매핑과 다르면 다시 추론하고 알린다.
- 템플릿을 쓰면 출력은 템플릿의 **열 이름과 순서를 그대로** 따른다. 템플릿에 없는 열은 만들지 않는다. `key` 역할 열이 없으면 막는다.
- 템플릿을 써도 다음 열은 빠진다: `omit` 열, 이번에 내보내지 않는 언어의 열, 주석 옵션을 끈 주석 열(`sharedComments`·`comments`). 모두 Unity가 건드리지 않게 하려는 것이다.
- 고른 언어인데 템플릿에 값 열이 없으면 그 언어는 내보내지 않고 알린다.
- 저장된 매핑이 없으면(옛 `unityTemplate`에서 옮긴 경우) 추론 결과를 쓰고, 화면에서 그대로 [매핑 저장]할 수 있다.
- 템플릿을 읽지 못하면 그 사실을 알리고 자동 생성 헤더를 미리보기에 보여준다. 사용자가 확인하고 내보낸다.

## 행 생성

- 대상은 `strings_master.csv`의 key 전체, 파일 순서 그대로.
- 원문 언어 값 열은 `source`, 대상 언어 값 열은 해당 `translations_{lang}.csv`의 `text`.
- 번역이 없는 칸(`untranslated`, 빈 번역)과 `stale` 칸 처리는 옵션 `export.missing`으로 고른다. 기본값은 `empty`.
  - `empty`(기본): 값을 비운다. Unity의 기존 번역이 있으면 빈 값으로 덮인다
  - `source`: 원문을 넣는다
  - `skip`: 내보내는 대상 언어 중 하나라도 해당하는 행을 통째로 뺀다. `CSV(Merge)...`로 가져오면 Unity의 그 행은 그대로 남는다
- 어떤 옵션이든 내보낸 행 수, 언어별로 비운 칸·원문으로 채운 칸 수, 뺀 행 수를 요약에 보고한다.
- 내보낼 언어는 화면에서 고른다(기본 전체). 빠진 언어의 열은 만들지 않는다 — Unity는 그 로케일을 건드리지 않는다.

## Smart 항목

- `strings_master.csv`의 `smart` 열(`true`/`false`/빈 값)이 Smart String 여부다. 원문 화면에서 토크나이저가 Smart 구문(플레이스홀더)을 찾았는데 `smart`가 비어 있는 행은 `true`로 **제안**하고, 사용자가 적용한다. 사용자가 `false`로 둔 행은 다시 제안하지 않는다.
- 내보낼 때 `smart=true`인 행 목록(키·Id·원문)을 화면에 보여주고 `{파일 이름}_smart.csv`(`Key`, `Id`)로 함께 쓴다. Unity에서 이 목록의 항목을 Smart로 표시한다.
- Smart 구문이 있는데 `smart`가 비어 있는 행은 개수를 경고로 보여준다. 막지는 않는다.

## 차단 조건

- 내보내는 칸의 QA `error`가 하나라도 있으면 막는다. 검사하는 칸은 번역문을 그대로 내보내는 칸뿐이다 — 비우거나 원문으로 채우는 칸, `skip`으로 뺀 행의 옛 번역은 Unity 로 가지 않는다. 진단 목록(언어·키·종류·메시지)을 보여주고 검토 화면의 그 행으로 이동할 수 있게 한다.
- `warning`은 막지 않지만 요약에 개수를 표시한다.
- 열 이름이 비거나 겹치면 막는다. 템플릿에 `key` 역할 열이 없으면 막는다.

## 쓰기

- 출력은 프로젝트 폴더의 `export/`에 쓴다. 파일 이름은 화면에서 정한다(기본: 연결한 컬렉션 이름, 없으면 프로젝트 이름). 파일 이름으로 쓸 수 없는 글자는 지운다.
- Unity 에서는 Localization Tables 창에서 컬렉션을 고르고 Import 메뉴의 `CSV(Merge)...`로 가져오라고 화면에서 안내한다.
- UTF-8, BOM 없음, 줄바꿈 `\n`, `csv-stringify` 사용.
- 파일마다 임시 파일에 쓴 뒤 원자적으로 교체한다. 이미 있는 파일을 덮어쓸 때는 덮어쓸 파일 목록을 보여주고 확인을 받는다.
- 내보낸 값이 CSV를 왕복해도 동일해야 한다. 쉼표·줄바꿈·따옴표·Smart Strings 중괄호가 든 문자열로 왕복 테스트를 작성한다.

## 글자 목록

- 내보낸 언어마다 값 열에 쓰인 글자를 모아 `{파일 이름}_chars_{언어}.txt`로 쓴다(폰트 아틀라스용, 옵션). 코드 포인트 순, 중복 없음.
- 변수 플레이스홀더와 리치 텍스트 태그 안의 글자는 화면에 나오지 않으므로 넣지 않는다. Smart 분기 안의 리터럴 글자는 넣는다.

## 테스트

- 자동 헤더: 언어 설정(빈 값·코드만·이름까지)과 주석 옵션 조합의 헤더를 고정한다. 이름표에 없는 코드, 겹치는 열 이름.
- Unity YAML: 로케일 에셋, 공유 데이터(긴 키 줄바꿈, 따옴표 키, `No`·`007` 같은 키, 2^53을 넘는 Id), 바이너리·깨진 파일의 실패 사유.
- 템플릿 열 추론: 로케일 표기가 다른 헤더 여러 종류에 대해 매핑 결과를 고정한다. 열 순서를 섞어도 출력이 따라가는지.
- 미번역 처리 세 가지 옵션의 출력 비교.
- 특수문자 왕복.
- 글자 목록: 플레이스홀더·태그 제외, Smart 분기 리터럴 포함.
