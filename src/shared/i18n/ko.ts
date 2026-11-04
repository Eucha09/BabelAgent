import type { JobKind, JobState, TranslateEffort, TranslateModel } from '../schema/jobs'
import type { TranslationStatus } from '../schema/project'
import type { QaRuleId } from '../schema/qa'
import type { BulkApproveSkipReason } from '../schema/review'

/**
 * 한국어 문구. 문구 카탈로그의 기준이다 — 다른 언어는 이 객체의 모양(`Messages`)을 그대로 따라야 typecheck 를 통과한다.
 * 값은 문자열이거나, 숫자·이름을 받아 문장을 만드는 함수다. 묶음은 화면·기능 단위로 나눈다.
 */
export const ko = {
  settings: {
    title: '설정',
    language: '언어'
  },

  account: {
    title: '계정',
    loginWindowOpen: '열린 Claude Code 창에서 로그인을 마치세요.',
    closeLoginWindow: '로그인 창 닫기',
    status: '상태',
    account: '계정',
    organization: '조직',
    authMethod: '인증 방식',
    configDir: '설정 폴더',
    checking: '확인 중…',
    loggedIn: '로그인됨',
    loggedOut: '로그아웃 상태',
    /** "사용량은 [Claude Console]에서 확인하세요." — 가운데에 링크가 들어간다 */
    consoleUsageBefore: '사용량은 ',
    consoleUsageAfter: '에서 확인하세요.',
    providerUsage: '사용량은 클라우드 제공자 콘솔에서 확인하세요.',
    loginSubscription: 'Claude 계정(구독)으로 로그인',
    loginSubscriptionTitle: 'Claude Pro·Max 등 구독 계정으로 로그인합니다',
    loginConsole: 'Console(API 과금)로 로그인',
    loginConsoleTitle: 'Anthropic Console 계정으로 로그인합니다. 사용량은 API 요금으로 청구됩니다',
    refresh: '새로고침',
    logout: '로그아웃'
  },

  /** `core/auth/method` 의 인증 방식 이름 */
  authMethod: {
    none: '로그인하지 않음',
    apiKey: (source: string) => `API 키 (${source})`,
    keySourceConsole: 'Console 로그인',
    keySourceEnv: '환경 변수 ANTHROPIC_API_KEY',
    keySourceHelper: 'apiKeyHelper 설정',
    provider: (name: string) => `클라우드 제공자 (${name})`,
    subscription: 'Claude 구독',
    subscriptionPlan: (plan: string) => `Claude 구독 (${plan})`
  },

  /** 구독 사용량 막대. 한도 이름과 남은 시간은 `core/usage/format` 이 쓴다 */
  usage: {
    loading: '사용량 확인 중…',
    empty: '표시할 사용량 정보가 없습니다.',
    remaining: (percent: number) => `${percent}% 남음`,
    session: '5시간',
    weekly: '주간',
    weeklyScoped: (scope: string) => `주간 · ${scope}`,
    weeklyScopedUnknown: '주간(범위)',
    noReset: '초기화 시각 없음',
    resetSoon: '곧 초기화',
    inDaysHours: (days: number, hours: number) => `${days}일 ${hours}시간 뒤`,
    inHoursMinutes: (hours: number, minutes: number) => `${hours}시간 ${minutes}분 뒤`,
    inMinutes: (minutes: number) => `${minutes}분 뒤`,
    underMinute: '1분 이내'
  },

  claudeCode: {
    title: 'Claude Code 연결',
    executable: '실행 파일',
    source: '출처',
    version: '버전',
    checking: '확인 중…',
    notFound: '찾지 못함',
    cannotRun: '실행하지 못함',
    cannotRunWith: (error: string) => `실행하지 못함 (${error})`,
    minVersion: (version: string) => ` · 최소 ${version}`,
    versionTooLow: '버전이 낮습니다. [업데이트 확인]을 누르세요.',
    sourceSetting: '설정한 경로',
    sourceNative: '공식 설치(자동 업데이트)',
    sourcePath: 'PATH',
    sourceBundled: '개발용(SDK 내장)',
    updateAfterJob: '작업이 끝난 뒤에 업데이트할 수 있습니다',
    inProgress: '진행 중…',
    checkUpdate: '업데이트 확인',
    install: 'Claude Code 설치',
    executablePath: '실행 파일 경로',
    executablePathPlaceholder: '비워 두면 자동으로 찾습니다',
    configDir: '설정 폴더',
    configDirPlaceholder: '비워 두면 CLAUDE_CONFIG_DIR 또는 ~/.claude',
    save: '저장',
    check: '연결 확인',
    connected: '연결됨',
    authFailedHint: '계정 카드에서 로그인하거나, 로그인한 설정 폴더를 지정하세요.'
  },

  appUpdate: {
    title: '앱 업데이트',
    currentVersion: '지금 버전',
    status: '상태',
    checking: '확인 중…',
    idle: '아직 확인하지 않았습니다.',
    current: (time: string) => `최신 버전입니다 (${time} 확인).`,
    available: (version: string) => `새 버전 ${version} 이 있습니다.`,
    downloading: (version: string, percent: number, transferred: string, total: string) =>
      `${version} 받는 중 ${percent}% (${transferred} / ${total} MB)`,
    downloadingUnknown: (version: string) => `${version} 받는 중…`,
    downloaded: (version: string) => `${version} 을 받아 두었습니다. 다시 시작하면 설치됩니다.`,
    check: '업데이트 확인',
    download: '받기',
    downloadAgain: '다시 받기',
    cancelDownload: '받기 멈춤',
    install: '다시 시작해 설치',
    installAfterJob: '작업이 끝난 뒤에 다시 시작할 수 있습니다',
    releaseNotes: '변경 내용 보기',
    releases: '릴리스 목록'
  },

  /** 번역 상태 이름 */
  status: {
    untranslated: '미번역',
    draft: '초안',
    review: '검토',
    approved: '승인',
    stale: '원문변경'
  } satisfies Record<TranslationStatus, string>,

  /** QA 진단 종류. 진단 목록·필터에 붙는 이름 */
  qaRule: {
    'var.missing': '변수 누락',
    'var.extra': '변수 추가됨',
    'var.meta_mismatch': 'vars 열 불일치',
    'var.meta_invalid': 'vars 열 읽기 실패',
    'smart.brace_unbalanced': '중괄호 짝',
    'smart.unknown_formatter': '모르는 포매터',
    'tag.set_mismatch': '태그 불일치',
    'tag.unclosed': '태그 짝',
    'len.over_max': '길이 초과',
    'text.empty': '빈 번역',
    'glossary.violation': '용어집',
    'glossary.violation_strict': '용어집(strict)',
    'status.stale': '원문 변경'
  } satisfies Record<QaRuleId, string>,

  /** 일괄 승인에서 건너뛴 이유 */
  bulkSkip: {
    'not-draft': '초안이 아님',
    empty: '빈 번역',
    'has-diagnostics': 'QA 진단 있음',
    'low-confidence': '신뢰도 낮음',
    changed: '그 사이 바뀜',
    missing: '키 없음'
  } satisfies Record<BulkApproveSkipReason, string>,

  /** 검토 화면의 빠른 필터 */
  quickFilter: {
    all: { label: '전체', hint: '모든 행' },
    'needs-review': { label: '검토 필요', hint: '번역은 있고 아직 승인하지 않은 행(초안·검토)' },
    'low-confidence': { label: '신뢰도 낮음', hint: '에이전트 신뢰도가 기준보다 낮은 승인 전 행' },
    'qa-error': { label: 'QA 오류', hint: '오류 진단이 있는 행. 내보내기를 막는다' },
    stale: { label: '원문 변경', hint: '번역한 뒤 원문이 바뀐 행(stale)' }
  },

  /** 사이드바 단계. description 은 마우스를 올리면 보인다 */
  screens: {
    project: { label: '프로젝트', description: '언어·게임 소개·톤 가이드·스타일 규칙·번역 설정' },
    strings: { label: '원문', description: '원문 가져오기와 편집' },
    context: { label: '컨텍스트', description: '컨텍스트·UI 유형·최대 길이·변수 설명 제안과 적용' },
    glossary: { label: '용어집', description: '용어 추출·번역·승인' },
    translate: { label: '번역', description: '배치 번역 실행' },
    review: { label: '검토/QA', description: '번역 검토와 QA 진단' },
    export: { label: '내보내기', description: 'Unity Localization CSV 내보내기' },
    settings: { label: '설정', description: '언어·계정·Claude Code·앱 업데이트' }
  },

  /** 번역 모델·사고 수준 선택지(번역 화면·프로젝트 화면)와 작업 카드의 설정 요약 */
  translateOptions: {
    model: {
      opus: 'Opus',
      sonnet: 'Sonnet',
      haiku: 'Haiku',
      default: '기본 (CLI 설정)'
    } satisfies Record<TranslateModel, string>,
    effort: {
      low: '낮음',
      medium: '중간',
      high: '높음',
      xhigh: '매우 높음',
      max: '최대'
    } satisfies Record<TranslateEffort, string>,
    effortHint: '높을수록 더 오래 생각하고 사용량을 더 씁니다. 모델이 지원하지 않는 수준은 그 모델이 지원하는 수준으로 낮춰 실행됩니다.',
    modelLabel: '모델',
    effortLabel: '사고 수준',
    summary: (model: string, effort: string) => `모델 ${model} · 사고 ${effort}`,
    batch: (rows: number, chars: string) => `배치 ${rows}행 / ${chars}자`,
    termBatch: (terms: number) => `배치 용어 ${terms}개`,
    workers: (count: number) => `작업자 ${count}`
  },

  /** 배치 작업(번역·컨텍스트 추정·용어 추출·용어 번역) 공통 */
  job: {
    title: {
      translate: '번역 작업',
      context: '컨텍스트 추정',
      terms: '용어 추출',
      'term-translate': '용어 번역'
    } satisfies Record<JobKind, string>,
    state: {
      running: '진행 중',
      paused: '일시정지',
      'waiting-limit': '사용량 한도 대기',
      done: '완료',
      cancelled: '취소됨'
    } satisfies Record<JobState, string>,
    /** 진행 수 뒤에 붙는 단위: "4 / 10행" */
    unit: { translate: '행', context: '행', terms: '행', 'term-translate': '개' } satisfies Record<JobKind, string>,
    /** 다른 작업이 도는 중이라 시작할 수 없을 때 버튼 옆에 붙는다 */
    busyWith: (title: string) => ` — ${title} 중`,
    rowsAndBatches: (rows: number, batches: number) => `${rows}행 · 배치 ${batches}개`,
    settingsUsed: (model: string, effort: string) => ` · 모델 ${model} · 사고 ${effort}`,
    barTitle: (done: number, failed: number, total: number) => `완료 ${done} / 실패 ${failed} / 전체 ${total}`,
    batchesDone: (count: number) => `배치 완료 ${count}`,
    batchesRunning: (count: number) => `진행 ${count}`,
    batchesStopping: (count: number) => `정리 중 ${count}`,
    batchesQueued: (count: number) => `대기 ${count}`,
    batchesFailed: (count: number) => `실패 ${count}`,
    limitStopped: '사용량 한도에 걸려 멈췄습니다.',
    limitResumeIn: (time: string) => `${time} 뒤 다시 시작합니다.`,
    limitManual: '한도가 풀린 뒤 [지금 재시도]를 누르세요.',
    pause: '일시정지',
    resume: '재개',
    retryNow: '지금 재시도',
    cancel: '취소',
    failures: (count: number) => `실패한 배치 (${count})`,
    batch: (id: number) => `배치 ${id}`,
    failuresHint: '실패한 배치는 기록하지 않았습니다. 다시 실행하면 남은 것만 처리합니다.',
    log: '작업 로그',
    logCount: (count: number) => `작업 로그 (${count})`,
    logEmpty: '아직 작업 기록이 없습니다.'
  },

  sidebar: {
    project: '프로젝트',
    noProject: '열린 프로젝트 없음',
    noTargets: '대상 언어 없음',
    openOrCreate: '폴더를 열거나 새로 만드세요',
    close: '닫기',
    open: '열기',
    create: '새로 만들기',
    steps: '단계',
    needsProject: '프로젝트를 먼저 열어야 합니다'
  },

  titleBar: {
    noProject: '프로젝트 없음',
    none: '없음',
    start: '시작'
  },

  statusBar: {
    checking: '확인 중',
    connected: '연결됨',
    loggedIn: '로그인됨',
    loggedOut: '로그아웃 상태',
    newVersion: (version: string) => `새 버전 ${version}`,
    download: '받기',
    downloading: '업데이트 받는 중',
    ready: (version: string) => `${version} 준비됨`,
    install: '다시 시작해 설치',
    account: '계정',
    project: '프로젝트',
    none: '없음',
    targets: '대상 언어',
    session: '세션',
    sessionKept: '유지'
  },

  common: {
    cancel: '취소',
    close: '닫기',
    save: '저장',
    discardChanges: '변경 취소',
    selectAll: '모두',
    clearSelection: '선택 해제',
    selected: (count: number) => `선택 ${count}`,
    readEncoding: (file: string, encoding: string) => `${file} 은 ${encoding}로 읽었습니다. 저장은 UTF-8로 합니다.`,
    noTargetLanguages: '대상 언어가 없습니다',
    setTargetLanguages: '프로젝트 화면에서 대상 언어를 정하세요.',
    resizeColumn: '끌어서 너비 조절 · 더블클릭하면 기본 너비',
    approvedNotTranslated: '승인된 행은 번역하지 않습니다'
  },

  conflict: {
    title: '파일 충돌',
    hint: '덮어쓰면 앱 밖의 변경이, 다시 불러오면 내 편집이 사라집니다.',
    reload: '다시 불러오기',
    overwrite: '덮어쓰기'
  },

  sourceDiff: {
    noPrevious: '이전 원문 기록이 없습니다.',
    before: '이전',
    after: '현재'
  },

  /** 원문 열 이름(가져오기 매핑·그리드 머리·컨텍스트 필드) */
  columns: {
    key: '키',
    source: '원문',
    context: '컨텍스트',
    ui_type: 'UI 유형',
    max_len: '최대 길이',
    vars: '변수',
    smart: 'Smart',
    tags: '태그'
  },

  newProject: {
    title: '새 프로젝트',
    name: '프로젝트 이름',
    namePlaceholder: '예: 바벨탑 RPG',
    sourceLanguage: '원문 언어',
    targetLanguages: '대상 언어',
    create: '만들기'
  },

  importDialog: {
    title: '원문 가져오기',
    cp949: '이 파일은 CP949로 읽었습니다. 저장은 UTF-8로 합니다.',
    notUsed: '(사용 안 함)',
    hint: '매핑하지 않은 열과 이 파일에 없는 키는 그대로 둡니다.',
    import: '가져오기'
  },

  addRow: {
    title: '행 추가',
    /** "<키> 바로 아래에 넣습니다." — 가운데에 키가 들어간다 */
    insertAfterBefore: '',
    insertAfterAfter: ' 바로 아래에 넣습니다.',
    insertEnd: '맨 끝에 넣습니다.',
    keyPlaceholder: '예: ui.options.title',
    problem: {
      empty: '키를 입력하세요.',
      duplicate: '이미 있는 키입니다.',
      newline: '키에 줄바꿈을 넣을 수 없습니다.'
    },
    keyLocked: '저장한 뒤에는 키를 바꿀 수 없습니다.',
    contextPlaceholder: '이 문장이 나오는 상황',
    add: '추가'
  },

  addTerm: {
    title: '용어 추가',
    intro: (languages: string) => `에이전트가 ${languages} 번역을 채워 승인 대기로 넣습니다.`,
    targetFallback: '대상 언어',
    term: '원문 용어 *',
    exists: '이미 용어집에 있는 용어입니다.',
    notFound: '원문에서 찾지 못했습니다. 원문에 나오는 표기 그대로 입력하세요.',
    found: (rows: number) => `원문 ${rows}행에서 찾았습니다.`,
    pos: '품사·분류 (선택)',
    agentFills: '비우면 에이전트가 채움',
    strict: 'strict — 승인 후 어기면 오류',
    note: '사용 지침 (선택)',
    notePlaceholder: '비우면 에이전트가 채움. 예: 로마자 그대로 쓴다',
    running: (seconds: number) => `에이전트가 번역을 채우는 중… ${seconds}초`,
    stop: '중단',
    add: '에이전트로 추가'
  },

  retranslateTerm: {
    title: '용어 재번역',
    current: (language: string) => `지금 ${language}`,
    currentNote: '지금 지침',
    none: '(없음)',
    instruction: '지시 (선택)',
    instructionPlaceholder: '예: 더 짧게. 비우면 더 나은 대안을 받습니다',
    hint: '결과는 칸에 채워지고, [저장]해야 반영됩니다.',
    running: (seconds: number) => `에이전트가 다시 번역하는 중… ${seconds}초`,
    stop: '중단',
    run: '재번역'
  },

  languagePicker: {
    search: '언어 이름이나 코드로 찾기',
    searchLabel: '언어 찾기',
    empty: '맞는 언어가 없습니다. 코드(예: en-GB)로 찾아 보세요.',
    custom: '직접 추가',
    choose: '언어 고르기',
    remove: (code: string) => `${code} 빼기`,
    add: '+ 언어 추가'
  },

  /** 그리드 공통(원문·컨텍스트·검토 그리드) */
  grid: {
    dragToReorder: '끌어서 순서 바꾸기',
    translation: '번역',
    translationIn: (language: string) => `번역 (${language})`,
    status: '상태',
    confidence: '신뢰도',
    note: '메모',
    newRow: '새 행',
    smartUnknown: (value: string) => `알 수 없는 값 "${value}" — 미정으로 봅니다`,
    smartUnset: '미정',
    smartOff: '일반',
    smartHasSyntax: '원문에 Smart 구문이 있습니다',
    smartSuggest: '제안',
    select: (name: string) => `${name} 선택`,
    noRows: '조건에 맞는 행이 없습니다.',
    varsNotes: '변수 설명 (vars)',
    editHint: '더블클릭하거나 Enter 로 편집',
    errors: (count: number) => `오류 ${count}`,
    warnings: (count: number) => `경고 ${count}`
  },

  contextGrid: {
    currentValue: '원문 행에 이미 있는 값',
    noSuggestion: '제안 없음',
    editHint: '고친 값이 적용됩니다. 비우면 이 필드는 적용하지 않습니다.',
    missingSource: '원문 없음',
    sourceChanged: '원문 변경',
    sourceChangedHint: '제안한 뒤 원문이 바뀌었습니다. 새 원문에 맞는지 확인하세요.',
    empty: '승인을 기다리는 제안이 없습니다.'
  },

  glossaryGrid: {
    candidateHint: '에이전트 후보. 승인해야 번역과 QA 에 쓰입니다',
    pending: '대기',
    partialHint: (languages: string) => `승인 대기 언어: ${languages} — [선택 승인]을 눌러야 그 언어의 번역이 번역과 QA 에 쓰입니다`,
    partial: '일부 대기',
    approved: '승인',
    term: '용어',
    waitingCell: '용어 번역이 채운 번역입니다. [선택 승인]을 눌러야 번역과 QA 에 쓰입니다',
    fixedTranslation: '확정 번역',
    pos: '품사·분류',
    noteHint: '번역 프롬프트에 용어와 함께 들어갑니다',
    note: '사용 지침',
    strictHint: '켜면 이 용어를 어긴 번역을 경고가 아니라 오류로 올립니다(내보내기를 막음)',
    reason: '근거 · 신뢰도',
    empty: '조건에 맞는 용어가 없습니다.'
  },

  reviewDetail: {
    noDiagnostics: 'QA 진단 없음',
    error: '오류',
    warning: '경고',
    emptyTranslation: '번역문이 없습니다',
    fixErrorsFirst: 'QA 오류를 고친 뒤 승인할 수 있습니다',
    staleClears: '지금 원문을 보고 판단했다는 뜻으로 원문변경 표시가 풀립니다',
    confidence: (value: string) => `신뢰도 ${value}`,
    edit: '번역 편집',
    editHint: 'Enter 또는 더블클릭으로도 편집합니다',
    source: '원문',
    sourceChanged: '원문 변경',
    translation: '번역',
    untranslated: '미번역',
    note: '메모',
    noteNeedsTranslation: '번역이 있어야 메모를 남길 수 있습니다',
    notePlaceholder: '검토 메모',
    saveNote: '메모 저장',
    reroll: '재번역',
    rerollPlaceholder: '추가 지시(선택). 예: 더 짧게',
    rerolling: (seconds: number) => `재번역 중… ${seconds}초`,
    rerollElsewhere: '다른 행을 재번역하는 중입니다',
    rerollHint: '일회성 세션으로 이 행만 다시 번역해 후보를 받습니다',
    candidate: '후보',
    instruction: (text: string) => `지시: ${text}`,
    candidateNote: (text: string) => `메모: ${text}`,
    candidateHasErrors: 'QA 오류가 있는 후보입니다. 적용한 뒤 고칠 수 있습니다',
    candidateApplyHint: '번역을 이 후보로 바꾸고 초안으로 둡니다',
    apply: '적용',
    discard: '버리기'
  },

  termTranslate: {
    title: '용어 번역',
    emptyCells: (count: number) => `빈 칸 ${count}`,
    scopeAll: '빈 칸 전체',
    scopeSelected: '선택한 용어',
    start: '번역 시작',
    plan: (terms: number, cells: number, batches: number) => `용어 ${terms}개 · 칸 ${cells}개 · 배치 ${batches}개`,
    nothing: '고른 언어에 빈 칸이 없습니다'
  },

  agentPanel: {
    ruleTitle: {
      add: '스타일 규칙 추가 제안',
      update: '스타일 규칙 수정 제안',
      remove: '스타일 규칙 삭제 제안'
    },
    save: '저장',
    saveAgain: '다시 저장',
    dismiss: '무시',
    saveHint: '저장하면 다음 번역부터 반영됩니다.',
    saving: '저장 중…',
    saved: '저장했습니다.',
    savedWithId: (id: string) => `저장했습니다 (${id}).`,
    dismissed: '무시했습니다.',
    expand: '에이전트 패널 펼치기',
    title: '에이전트',
    noSession: '세션 없음',
    sessionKept: '세션 유지',
    newSession: '새 세션',
    collapse: '접기',
    jobLog: '작업 로그',
    jobRunning: '· 진행 중',
    emptyOpen: '프로젝트에 대해 묻거나 지시를 주세요. 예: "앞으로 NPC 대사는 반말로"',
    emptyClosed: '프로젝트를 열면 에이전트를 사용할 수 있습니다.',
    ruleLabel: '규칙',
    ruleSeeCard: (title: string) => `${title} — 아래 카드에서 확인`,
    toolLabel: '도구',
    placeholder: '메시지를 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈)',
    placeholderClosed: '프로젝트를 먼저 열어주세요',
    send: '전송'
  },

  /** 앱을 켤 때 Claude Code 확인 창 */
  claudeGate: {
    ariaLabel: 'Claude Code 확인',
    checking: 'Claude Code 확인 중…',
    updating: 'Claude Code 업데이트 확인 중…',
    currentVersion: (version: string) => `지금 버전 ${version}`,
    needed: 'Claude Code 가 필요합니다',
    /** "설정한 경로의 … 실행하지 못했습니다: <경로>. 설정 화면에서 …" — 가운데에 경로가 들어간다 */
    settingFailedBefore: '설정한 경로의 Claude Code 를 실행하지 못했습니다: ',
    settingFailedAfter: '. 설정 화면에서 경로를 비우면 자동으로 찾습니다.',
    notFound: '이 PC 에서 Claude Code 를 찾지 못했습니다.',
    installHint: '[설치]를 누르면 새 창에서 공식 설치 스크립트를 실행합니다: ',
    manualInstallBefore: '터미널에서 ',
    manualInstallAfter: ' 를 실행해 설치한 뒤 앱을 다시 여세요.',
    openedWithout: 'Claude Code 없이 열었습니다. 에이전트 기능은 쓸 수 없습니다.',
    later: '나중에',
    install: '설치',
    cannotRun: 'Claude Code 를 실행하지 못했습니다',
    /** "<경로> 가 응답하지 않았습니다." — 앞에 경로가 온다 */
    notResponding: ' 가 응답하지 않았습니다. 잠시 뒤 다시 시도하세요.',
    openedUnchecked: 'Claude Code 를 확인하지 못한 채로 열었습니다.',
    retry: '다시 시도',
    installing: 'Claude Code 설치 중',
    installingHint: '설치 창에서 진행합니다. 끝나면 그 창에서 Enter 를 눌러 닫으세요.',
    closeInstall: '설치 창 닫기',
    checkFailed: 'Claude Code 를 확인하지 못했습니다',
    updateUnfinished: '업데이트가 끝나지 않았습니다. 네트워크를 확인한 뒤 다시 시도하세요.',
    canContinue: (version: string) => `지금 버전 ${version} 으로 계속 쓸 수 있습니다.`,
    skippedUpdate: 'Claude Code 업데이트를 건너뛰었습니다.',
    continueCurrent: '지금 버전으로 계속',
    continue: '계속',
    requiredWarning: (version: string) => `최소 버전 ${version} 보다 낮아 일부 기능이 동작하지 않을 수 있습니다.`,
    updated: (before: string, after: string) => `Claude Code 를 ${before} → ${after} 으로 업데이트했습니다.`,
    skippedDev: (version: string) => `개발용 Claude Code(${version})를 씁니다. 업데이트하지 않습니다.`,
    upToDate: (version: string) => `Claude Code 가 최신입니다 (${version}).`
  },

  welcome: {
    openProject: '프로젝트 열기',
    openFolder: '폴더 열기',
    newProject: '새 프로젝트 만들기',
    recent: '최근 프로젝트',
    reopen: '다시 열기'
  },

  translate: {
    scope: {
      untranslated: { label: '미번역', hint: '번역이 없거나 비어 있는 행' },
      stale: { label: 'stale', hint: '원문이 바뀐 행' },
      all: { label: '전체', hint: '승인되지 않은 모든 행. 초안·검토 번역도 다시 씁니다' },
      selected: { label: '선택 행', hint: '아래 목록에서 고른 행' }
    },
    targetLanguage: '대상 언어',
    start: '번역 시작',
    skippedApproved: (rows: number) => ` · 승인 ${rows}행 제외`,
    started: (language: string, rows: number) => `번역을 시작했습니다: ${language} · ${rows}행`,
    rowsToTranslate: '번역할 행',
    onlyUntranslated: '미번역만',
    onlyStale: 'stale만'
  },

  contextScreen: {
    field: {
      context: '컨텍스트',
      ui_type: 'UI 유형',
      max_len: '최대 길이',
      vars: '변수 설명'
    },
    fieldHint: {
      context: '문장이 나오는 상황·화자·가리키는 대상',
      ui_type: 'dialogue, button, tooltip 같은 분류. 이미 쓰는 값을 따릅니다',
      max_len: (ratio: number, min: number) => `버튼·탭 같은 짧은 UI 문구에만 제안합니다. 원문 길이 × ${ratio}(최소 ${min}자) 이상`,
      vars: '원문의 변수마다 종류·의미·예시. 변수가 없는 행은 묻지 않습니다'
    },
    /** 제안을 적용할 때 건너뛴 이유 */
    skip: {
      missing: '원문에 없음',
      changed: '그 사이 원문 칸이 바뀜',
      invalid: '값 형식 오류',
      empty: '적용할 값 없음'
    },
    applied: (rows: number) => `${rows}행을 원문에 적용했습니다.`,
    skipped: (rows: number, reasons: string) => `${rows}행은 건너뛰었습니다(${reasons}).`,
    started: (rows: number) => `컨텍스트 추정을 시작했습니다: ${rows}행`,
    discarded: (rows: number) => `제안 ${rows}행을 버렸습니다.`,
    infer: '컨텍스트 추정',
    scopeEmpty: '빈 칸 있는 행',
    scopeEmptyHint: '고른 필드 중 빈 칸이 있는 모든 행',
    scopeSelected: '선택 행',
    scopeSelectedHint: '아래 목록에서 고른 행',
    start: '추정 시작',
    skippedPending: (rows: number) => ` · 제안 대기 ${rows}행 제외`,
    rowsToInfer: '추정할 행',
    meta: (rows: number, low: number, chosen: number) => `제안 ${rows}행 · 신뢰도 낮음 ${low} · 선택 ${chosen}`,
    edited: ' · 고친 제안 있음',
    selectConfident: (count: number) => `기준 이상 선택 (${count})`,
    selectConfidentHint: (threshold: number) => `신뢰도 ${threshold} 이상이고, 원문이 바뀌지 않았고, 값 형식이 맞는 제안을 고릅니다`,
    selectAll: '모두 선택',
    discardSelected: '선택 버리기',
    applySelected: (count: number) => `선택 적용 (${count})`,
    fixFirst: '형식이 틀린 값이나 원문에 없는 행을 먼저 고치거나 선택에서 빼세요',
    discardTitle: '제안 버리기',
    discardConfirm: (rows: number) => `${rows}행 버리기`,
    discardBody: (rows: number) => `선택한 제안 ${rows}행을 버립니다. 원문은 바뀌지 않습니다.`
  },

  glossaryScreen: {
    filter: { all: '전체', pending: '승인 대기', approved: '승인' },
    /** 저장·승인·삭제에서 건너뛴 이유 */
    skip: {
      missing: '파일에 없음',
      changed: '그 사이 바뀜',
      exists: '같은 용어가 있음',
      invalid: '용어가 빔'
    },
    emptyTerm: '용어가 비었습니다',
    duplicateTerm: '다른 용어와 겹칩니다',
    saved: (count: number) => `용어 ${count}개를 저장했습니다.`,
    approved: (count: number) => `용어 ${count}개를 승인했습니다.`,
    deleted: (count: number) => `용어 ${count}개를 지웠습니다.`,
    skipped: (count: number, reasons: string) => `건너뜀 ${count}개(${reasons}).`,
    recheckChanged: '바뀐 행은 지금 파일 내용을 확인한 뒤 다시 저장하세요.',
    added: (term: string, found: number, examples: number) => `"${term}" 을 승인 대기로 추가했습니다(원문 ${found}행 중 ${examples}행 참고).`,
    addedConflicts: (counts: string) => `기존 번역 중 이 번역과 다른 행이 있습니다(${counts}) — 승인하면 용어집 위반으로 표시됩니다.`,
    conflictRows: (language: string, rows: number) => `${language} ${rows}행`,
    none: '(없음)',
    noteCleared: '지침 비움',
    noteRewritten: '지침 다시 씀',
    retranslated: (term: string, changes: string) => `"${term}" 재번역 결과를 칸에 넣었습니다(${changes}). 확인하고 [저장]하세요.`,
    retranslatedSame: (term: string) => `"${term}" 은 지금 번역과 지침이 그대로 제안됐습니다.`,
    retranslatedConflicts: (counts: string) => `기존 번역 중 새 번역과 다른 행이 있습니다(${counts}).`,
    editsDiscarded: '고친 칸을 모두 되돌렸습니다.',
    extractStarted: (rows: number) => `용어 추출을 시작했습니다: ${rows}행`,
    translateStarted: (terms: number, languages: string) => `용어 번역을 시작했습니다: 용어 ${terms}개 (${languages})`,
    noTargets: '대상 언어가 없습니다. 프로젝트 화면에서 정하세요.',
    extract: '용어 추출',
    scopeAll: '전체 원문',
    scopeSelected: '선택 행',
    startExtract: '추출 시작',
    extracted: '추출이 끝났습니다. 번역은 [용어 번역]으로 채우세요.',
    rowsToSearch: '용어를 찾을 행',
    duplicates: (terms: string) => `같은 용어가 여러 행 있습니다: ${terms} — 첫 행만 고칠 수 있습니다.`,
    search: '용어·번역·지침 검색',
    meta: (shown: number, total: number, chosen: number) => `${shown} / ${total}개 · 선택 ${chosen}`,
    editedRows: (count: number) => ` · 고친 행 ${count}`,
    saving: ' · 저장 중…',
    add: '용어 추가',
    selectVisible: '보이는 행 선택',
    deleteSelected: '선택 삭제',
    retranslateSelected: '선택 재번역',
    retranslateHint: '선택한 용어의 번역을 에이전트로 다시 받습니다',
    pickOne: '용어를 하나만 선택하세요',
    approveSelected: (count: number) => `선택 승인 (${count})`,
    approveHint: '선택한 승인 대기 용어와 승인 대기 언어를 승인합니다. 고친 칸이 있으면 함께 저장합니다',
    fixRedFirst: '빨간 칸의 용어를 먼저 고치세요',
    deleteTitle: '용어 삭제',
    deleteConfirm: (count: number) => `${count}개 삭제`,
    deleteBody: (count: number) => `선택한 용어 ${count}개를 glossary.csv 에서 지웁니다.`,
    deleteApproved: (count: number) => `승인된 용어 ${count}개가 포함되어 있습니다.`
  },

  stringsScreen: {
    reloaded: (file: string) => `${file} 이 밖에서 바뀌어 다시 읽었습니다.`,
    created: 'strings_master.csv 를 만들었습니다.',
    saved: '저장했습니다.',
    removedRows: (rows: number, translations: number) => `${rows}개 행을 지우고 번역 ${translations}개를 함께 지웠습니다.`,
    staleMarked: (count: number) => `${count}개 번역을 stale로 표시했습니다.`,
    imported: (added: number, changed: number, unchanged: number) => `가져오기 완료: 추가 ${added} · 변경 ${changed} · 유지 ${unchanged}`,
    smartApplied: (rows: number) => `Smart 제안 ${rows}행을 적용했습니다. [저장]하면 원문 파일에 반영됩니다.`,
    languageLocked: '저장한 뒤에 언어를 바꿀 수 있습니다',
    languageTitle: '보여줄 번역 언어',
    importLocked: '저장한 뒤에 가져올 수 있습니다',
    importTitle: 'CSV에서 원문 가져오기',
    import: '원문 가져오기',
    discardHint: '저장하지 않은 변경을 모두 버리고 파일을 다시 읽습니다',
    external: (file: string) => `${file} 이 앱 밖에서 바뀌었습니다. 편집 중이라 다시 읽지 않았습니다.`,
    importResult: '가져오기 결과',
    resultAdded: '추가',
    resultChanged: '원문 변경',
    resultUnchanged: '그대로',
    resultStale: 'stale 표시',
    resultMissing: '이번 파일에 없음',
    resultMissingKept: ' — 지우지 않았습니다',
    resultDuplicates: '중복 키',
    resultEmptyKeys: '빈 키 행',
    empty: '원문이 비어 있습니다',
    addRow: '행 추가',
    noFile: '원문 파일이 없습니다',
    createFile: '빈 원문 파일 만들기',
    rows: (count: number) => `${count}행`,
    translationLanguage: (language: string) => ` · 번역 언어 ${language}`,
    noTargets: ' · 대상 언어 없음',
    pendingDelete: (count: number) => ` · 삭제 대기 ${count}`,
    selectedKey: ' · 선택 ',
    smartApplyHint: 'Smart 구문이 있고 Smart 칸이 미정인 행을 Smart 로 둡니다',
    smartApply: (count: number) => `Smart 제안 적용 (${count})`,
    moveUpHint: '선택한 행을 위로 (Alt+↑)',
    moveUp: '↑ 위로',
    moveDownHint: '선택한 행을 아래로 (Alt+↓)',
    moveDown: '↓ 아래로',
    deleteRowHint: '선택한 행 삭제',
    deleteRow: '행 삭제',
    delete: '삭제',
    translationOf: (language: string, text: string, status: string) => `${language} 번역: ${text} (${status})`,
    approvedDeleted: '승인된 번역이 함께 지워집니다.',
    deleteHint: '저장하면 원문과 모든 번역 파일에서 이 키를 지웁니다.',
    discardConfirm: '변경 버리기',
    discarded: '저장하지 않은 변경을 버렸습니다.'
  },

  /** 언어별 Unity 로케일 코드·열 이름 표(프로젝트 화면·내보내기 화면) */
  localeTable: {
    language: '언어',
    localeCode: 'Unity 로케일 코드',
    columnName: '열 이름',
    source: '원문',
    localeCodeOf: (language: string) => `${language} Unity 로케일 코드`,
    columnNameOf: (language: string) => `${language} 열 이름`
  },

  projectScreen: {
    saved: '프로젝트 설정을 저장했습니다.',
    savedWithNotice: (notice: string) => `프로젝트 설정을 저장했습니다. ${notice}`,
    glossaryGap: (languages: string, terms: number) =>
      `용어집에 ${languages} 번역이 빈 용어가 ${terms}개 있습니다 — 용어집 화면의 [용어 번역]으로 채우세요.`,
    fixRedFirst: '빨간 글씨로 표시한 칸을 먼저 고치세요',
    external: 'project.json 이 앱 밖에서 바뀌었습니다. [변경 취소]를 누르면 다시 읽습니다.',
    basics: '기본 정보',
    name: '프로젝트 이름',
    sourceLanguage: '원문 언어',
    sourceUnchanged: '원문 파일 내용은 바뀌지 않습니다.',
    targetLanguages: '대상 언어',
    filesKept: (files: string) => `${files} 파일은 지우지 않습니다.`,
    game: '게임',
    genre: '장르',
    genrePlaceholder: '예: 판타지 RPG',
    intro: '게임 소개',
    introPlaceholder: '세계관, 주요 인물 등 번역에 필요한 배경',
    tone: '톤 가이드',
    tonePlaceholder: '예: 간결하고 경쾌하게',
    styleRules: '스타일 규칙',
    noRules: '아직 규칙이 없습니다.',
    rulePlaceholder: '예: NPC 대사는 반말로',
    deleteRuleHint: '이 규칙 삭제',
    deleteRule: '삭제',
    addRule: '규칙 추가',
    translation: '번역',
    batchRows: '배치 행 수',
    batchChars: '배치 글자 수',
    workers: (max: number) => `동시 작업자 (1~${max})`,
    review: '검토',
    lowConfidence: '신뢰도 낮음 기준 (0~1)',
    context: '컨텍스트 추정',
    maxLenRatioHint: (min: number) => `에이전트가 제안하는 최대 길이의 하한: 원문 길이 × 배수(최소 ${min}자)`,
    maxLenRatio: (limit: number) => `최대 길이 배수 (1~${limit})`,
    export: '내보내기',
    smart: '고급: Smart Strings',
    smartHint: 'Unity 프로젝트의 SmartFormat 설정과 같게 맞추세요.',
    smartEnabled: 'Smart Strings 사용',
    alternativeEscaping: '대체 이스케이프 (alternativeEscaping)',
    characterLiterals: '문자 리터럴 변환 (convertCharacterStringLiterals)',
    caseSensitive: '대소문자 구분 (caseSensitive)',
    escapeChar: '이스케이프 문자 (escapeChar)',
    formatters: '포매터 목록 (쉼표로 구분)'
  },

  reviewScreen: {
    approved: (rows: number) => `${rows}행을 승인했습니다.`,
    skipped: (rows: number, reasons: string) => `${rows}행은 건너뛰었습니다(${reasons}).`,
    reloaded: (file: string) => `${file} 이 밖에서 바뀌어 다시 읽었습니다.`,
    saved: (key: string) => `${key} 을 저장했습니다.`,
    statusChanged: (key: string, status: string) => `${key} → ${status}`,
    noteSaved: (key: string) => `${key} 메모를 저장했습니다.`,
    candidateApplied: (key: string) => `${key} 에 재번역 후보를 적용했습니다(초안).`,
    rerunQa: 'QA 다시 실행',
    jobRunning: '번역 작업이 진행 중입니다. 배치가 기록될 때마다 다시 읽습니다.',
    externalChange: (file: string) => `${file} 이 바뀌었습니다. 편집을 마치면 다시 읽습니다.`,
    threshold: (hint: string, value: number) => `${hint} (기준 ${value})`,
    statusFilter: '상태',
    allStatuses: '모든 상태',
    ruleFilter: '진단 종류',
    allRules: '모든 진단',
    search: '키·원문·번역·메모 검색',
    meta: (shown: number, total: number, errors: number, warnings: number) =>
      `${shown} / ${total}행 · 오류 ${errors}건 · 경고 ${warnings}건`,
    saving: ' · 저장 중…',
    loading: ' · 읽는 중…',
    bulkHint: (threshold: number) =>
      `지금 목록에 보이는 초안 중 QA 오류·경고가 없고 신뢰도가 ${threshold} 이상인 행(신뢰도가 없는 행 포함)을 승인합니다`,
    bulk: (count: number) => `초안 일괄 승인 (${count})`,
    pickRow: '행을 고르세요.',
    replaceApproved: '승인된 번역 바꾸기',
    applyCandidate: '후보 적용',
    /** "<키> 은 승인된 행입니다. …" — 앞에 키가 온다 */
    replaceApprovedBody: ' 은 승인된 행입니다. 후보를 적용하면 번역이 바뀌고 초안으로 돌아갑니다.',
    bulkTitle: '초안 일괄 승인',
    bulkConfirm: (rows: number) => `${rows}행 승인`,
    bulkBody: (rows: number) => `보이는 행 중 아래 조건에 맞는 초안 ${rows}행을 승인합니다.`,
    bulkDraft: '상태가 초안',
    bulkNoIssues: 'QA 오류·경고가 하나도 없음',
    bulkConfidence: (threshold: number) => `신뢰도 ${threshold} 이상`,
    bulkWithoutConfidence: (rows: number) => ` — 신뢰도가 없는 ${rows}행(사람이 고친 초안)도 포함`,
    bulkMore: (rows: number) => ` 외 ${rows}행`
  },

  exportScreen: {
    /** 헤더 칩의 출처 */
    origin: { auto: '자동', setting: '설정', unity: 'Unity', template: '템플릿' },
    /** 미번역·원문 변경 칸을 어떻게 내보낼지 */
    missing: {
      empty: { label: '비우기', hint: 'Unity 의 기존 번역이 빈 값으로 덮입니다.' },
      source: { label: '원문 넣기', hint: '원문을 그대로 넣습니다.' },
      skip: { label: '행 빼기', hint: '비는 행을 뺍니다. CSV(Merge)... 로 가져오세요.' }
    },
    /** 템플릿 열의 역할 */
    role: { key: 'Key', id: 'Id', sharedComments: 'Shared Comments (컨텍스트)', omit: '내보내지 않음' },
    roleValue: (language: string) => `값 · ${language}`,
    roleComments: (language: string) => `주석(메모) · ${language}`,
    exportedMessage: (dir: string, files: number) => `${dir}/ 에 파일 ${files}개를 내보냈습니다.`,
    mappingSaved: '템플릿 열 매핑을 저장했습니다.',
    calculating: '계산 중…',
    recalculate: '다시 계산',
    blockedHint: '막는 문제를 먼저 고치세요',
    export: '내보내기',
    exported: '내보냈습니다',
    exportedDetail: (dir: string, files: string, rows: number) => ` — ${dir}/ 에 ${files} · ${rows}행`,
    smartCount: (count: number) => ` · Smart 항목 ${count}개`,
    openFolder: '폴더 열기',
    languagesAndOptions: '언어와 옵션',
    languagesToExport: '내보낼 언어',
    source: '원문',
    sharedComments: 'Shared Comments 열에 컨텍스트(context) 넣기',
    localeComments: '언어별 Comments 열에 번역 메모(note) 넣기',
    commentsWarning: '빈 주석 칸은 Unity 의 기존 주석을 지웁니다.',
    glyphs: '언어별 글자 목록 파일도 만들기(폰트 아틀라스용)',
    missingLabel: '미번역·원문 변경 칸',
    fileName: '파일 이름 (확장자 제외)',
    unity: 'Unity 프로젝트 (선택)',
    unityHint: '로케일 코드와 기존 키 Id 를 읽어 옵니다. Unity 프로젝트에는 쓰지 않습니다.',
    linkUnity: 'Unity 프로젝트 연결',
    linked: 'Unity 프로젝트를 연결했습니다.',
    unlinked: 'Unity 연결을 풀었습니다.',
    unityFailed: 'Unity 프로젝트를 읽지 못했습니다',
    unityFallback: ' — 기본 자동 생성으로 내보냅니다.',
    folderLabel: '폴더: ',
    reload: '다시 읽기',
    otherFolder: '다른 폴더',
    unlink: '연결 해제',
    folder: '폴더',
    locales: '로케일',
    none: '없음',
    collection: '컬렉션',
    collectionPicked: '컬렉션을 골랐습니다.',
    choose: '(고르세요)',
    collectionOption: (name: string, keys: number) => `${name} · 키 ${keys}개`,
    keyIds: '키 Id',
    idSummary: (found: number, newKeys: number, unityOnly: number) => `찾음 ${found} · 새 키 ${newKeys} · Unity 에만 있음 ${unityOnly}`,
    unityOnlyWarning: (keys: number) => `Unity 에만 있는 키 ${keys}개는 CSV... 로 가져오면 지워집니다. CSV(Merge)... 로 가져오세요.`,
    template: '템플릿 (선택)',
    templateHint: 'Unity CSV 확장의 열 구성을 바꾼 경우에만 필요합니다.',
    registerTemplate: '템플릿 등록',
    templateRegistered: '템플릿을 등록했습니다.',
    templateReregistered: '템플릿을 다시 등록했습니다.',
    templateCleared: '템플릿 등록을 풀었습니다.',
    templateFailed: '템플릿을 읽지 못했습니다',
    templateFallback: ' — 자동 생성 헤더를 씁니다.',
    reregister: '다시 등록',
    unregister: '등록 해제',
    templateColumns: (count: number) => ` · 열 ${count}개`,
    templateColumn: '템플릿 열',
    roleHeader: '역할',
    saveMapping: '매핑 저장',
    revert: '되돌리기',
    headerPreview: '헤더 미리보기',
    autoGenerated: '자동 생성',
    codeOrigin: { setting: '설정', unity: 'Unity', project: '프로젝트 코드' },
    nameOrigin: { setting: '설정', auto: '자동' },
    editCodes: '코드·열 이름 고치기',
    columnIgnored: '열 이름이 Unity 와 다르면 그 열은 무시됩니다.',
    qaClean: (warnings: number) => `QA 오류 없음 · 경고 ${warnings}개`,
    qaBlocked: (warnings: number) => `QA 오류가 있어 내보낼 수 없습니다 · 경고 ${warnings}개`,
    openInReview: '검토에서 보기',
    smartTitle: (count: number) => `Smart 항목 ${count}개`,
    smartHint: 'Unity CSV 는 Smart 여부를 옮기지 않습니다. Unity 에서 직접 표시하세요.',
    smartUnset: (rows: number) => `Smart 여부가 미정인 행이 ${rows}개 있습니다(원문 화면의 [Smart 제안 적용]).`,
    summary: '요약',
    rowsToExport: '내보낼 행',
    skippedRows: (rows: number, keys: string) => ` · 뺀 행 ${rows} (${keys})`,
    filled: (filled: number, blank: number) => `채움 ${filled} · 비움 ${blank}`,
    sourceFilled: (rows: number) => ` · 원문으로 ${rows}`,
    output: '출력',
    overwrites: ' (있음 · 덮어씀)',
    /** "Unity 에서는 <CSV(Merge)...> 로 가져오세요. <CSV...> 는 …" — 메뉴 이름이 사이에 들어간다 */
    importBefore: 'Unity 에서는 ',
    importMiddle: ' 로 가져오세요. ',
    importAfter: ' 는 파일에 없는 키를 지웁니다.',
    overwriteTitle: '파일 덮어쓰기',
    overwrite: '덮어쓰기',
    overwriteBody: (dir: string) => `${dir}/ 에 이미 있는 파일을 새로 씁니다.`
  },

  /** App 이 상태바에 남기는 메시지와 저장하지 않은 변경 확인 */
  app: {
    agentDone: (seconds: string) => `에이전트 응답 완료 (${seconds}초)`,
    agentError: (kind: string) => `에이전트 오류: ${kind}`,
    projectReloaded: 'project.json 이 바뀌어 설정을 다시 읽었습니다.',
    updateAvailable: (version: string) => `새 버전 ${version} 이 있습니다. 상태바나 설정 화면에서 [받기]를 누르세요.`,
    updateDownloaded: (version: string) => `${version} 을 받아 두었습니다. 다시 시작하거나 앱을 끌 때 설치됩니다.`,
    appUpToDate: '앱이 최신 버전입니다.',
    downloadStopped: '업데이트 받기를 멈췄습니다.',
    installingUpdate: '업데이트를 설치하려고 앱을 닫습니다. 설치가 끝나면 다시 열립니다.',
    cliFound: (version: string) => `Claude Code ${version} 을 찾았습니다.`,
    cliNotFound: 'Claude Code 를 찾지 못했습니다. 설치 창의 메시지를 확인하세요.',
    cliSkipped: '개발용 Claude Code 는 업데이트하지 않습니다.',
    cliUpdateFailed: '업데이트하지 못했습니다. 설정 화면에서 다시 시도하세요.',
    installWindow: '설치 창에서 진행합니다. 끝나면 그 창을 닫으세요.',
    loginChecked: (method: string) => `로그인 상태를 확인했습니다: ${method}`,
    loginNotDone: '로그인 창이 닫혔지만 로그인되지 않았습니다.',
    loginClosed: '로그인 창을 닫았습니다.',
    loggedOut: '로그아웃했습니다.',
    projectOpened: (name: string) => `프로젝트를 열었습니다: ${name}`,
    projectClosed: '프로젝트를 닫았습니다.',
    settingsSaved: '설정을 저장했습니다.',
    translateSettingsSaved: (summary: string) => `번역 설정을 저장했습니다: ${summary}`,
    agentSent: '에이전트에 요청을 보냈습니다…',
    ruleSaved: (id: string) => `스타일 규칙을 저장했습니다 (${id}). 다음 번역 배치부터 반영됩니다.`,
    unsavedTitle: '저장하지 않은 변경',
    discardClose: '버리고 닫기',
    discardRestart: '버리고 다시 시작',
    discardLeave: '버리고 이동',
    unsavedBody: (screen: string) => `${screen} 화면에 저장하지 않은 변경이 있습니다. 계속하면 사라집니다.`
  },

  /** 메인 프로세스가 돌려주는 오류 문구 */
  errors: {
    notAProject: '프로젝트를 먼저 열어야 합니다.',
    agentNeedsProject: '프로젝트를 먼저 열어야 에이전트를 쓸 수 있습니다.',
    invalidRequest: '요청 형식이 올바르지 않습니다.',
    notTargetLanguage: (language: string) => `${language} 은 이 프로젝트의 대상 언어가 아닙니다.`,
    keyNotInSource: (key: string) => `원문에 없는 키입니다: ${key}`,
    folderPickCancelled: '폴더 선택을 취소했습니다.',
    filePickCancelled: '파일 선택을 취소했습니다.',
    sdkLoadFailed: 'Agent SDK를 불러오지 못했습니다.',
    settingsInvalid: '설정 값이 올바르지 않습니다.',
    settingsSaveFailed: '설정을 저장하지 못했습니다.',
    // 파일
    fileLocked: (path: string) => `${path} 파일이 잠겨 있어 접근할 수 없습니다. 엑셀 등 다른 프로그램에서 열려 있는지 확인하세요.`,
    fileNoPermission: (path: string) => `${path} 에 접근할 권한이 없습니다.`,
    fileNotFound: (path: string) => `${path} 를 찾을 수 없습니다.`,
    diskFull: '디스크 공간이 부족합니다.',
    fileError: (path: string, error: string) => `${path} 처리 중 오류: ${error}`,
    fileExistsUnread: (file: string) => `${file} 파일이 이미 있습니다. 앱에서 읽지 않은 파일이라 덮어쓰기 전에 확인이 필요합니다.`,
    fileChangedOutside: (file: string) => `${file} 파일이 앱 밖에서 바뀌었습니다.`,
    missingColumns: (file: string, columns: string) => `${file} 에 필수 열이 없습니다: ${columns}`,
    sourceSavedPartly: (file: string) => `원문은 저장했지만 ${file} 을 고치지 못했습니다. 원인을 해결한 뒤 다시 저장하세요.`,
    fileMissing: (file: string) => `${file} 이 없습니다.`,
    fileAlreadyExists: (file: string) => `${file} 이 이미 있습니다.`,
    suggestionsNotCleared: (file: string) => `원문에는 넣었지만 ${file} 에서 적용한 제안을 지우지 못했습니다.`,
    noTranslationRow: '(번역 행 없음)',
    rowChanged: (key: string) => `${key} 행이 편집하는 사이에 바뀌었습니다(번역 작업 기록 또는 앱 밖 편집).`,
    currentContent: (text: string) => `지금 파일의 내용: ${text}`,
    qaBlocksApproval: 'QA 오류가 있어 승인할 수 없습니다.',
    // 프로젝트 열기·만들기
    pathNotAbsolute: '프로젝트 경로는 절대 경로여야 합니다.',
    notAFolder: '폴더가 아닙니다.',
    alreadyProject: '이미 Babel Agent 프로젝트인 폴더입니다. "프로젝트 열기"를 사용하세요.',
    noProjectFile: (file: string) => `${file} 이 없는 폴더입니다. 새 프로젝트로 만들거나 다른 폴더를 선택하세요.`,
    projectJsonInvalid: (file: string) => `${file} 을 읽을 수 없습니다. JSON 형식이 올바르지 않습니다.`,
    schemaVersionInvalid: (file: string) => `${file} 의 schemaVersion 이 올바르지 않습니다.`,
    readValue: (value: string) => `읽은 값: ${value}`,
    schemaTooNew: (found: number) => `이 프로젝트는 더 새로운 버전의 Babel Agent에서 만들어졌습니다(schemaVersion ${found}). 앱을 업데이트하세요.`,
    supportedVersion: (version: number) => `앱이 지원하는 버전: ${version}`,
    migrationMissing: (from: number, to: number) => `schemaVersion ${from} → ${to} 마이그레이션이 아직 구현되지 않았습니다.`,
    projectSchemaMismatch: (file: string) => `${file} 의 내용이 스키마와 맞지 않습니다.`,
    projectSettingsInvalid: '설정에 고칠 곳이 있어 저장하지 않았습니다.',
    glossaryUnreadableQa: (error: string) => `용어집을 읽지 못해 용어 검사를 건너뛰었습니다: ${error}`,
    // 앱 업데이트
    updateDevMode: '개발 모드에서는 앱 업데이트를 확인하지 않습니다. 설치판에서만 동작합니다.',
    updateUnsupportedOs: '이 운영체제용 설치판이 없어 앱 업데이트를 확인하지 않습니다.',
    noUpdateToDownload: '받을 새 버전이 없습니다. 먼저 업데이트를 확인하세요.',
    noUpdateToInstall: '설치할 업데이트가 없습니다.',
    restartAfterJob: (reason: string) => `작업이 끝난 뒤에 다시 시작할 수 있습니다. ${reason}`,
    updateAfterJob: (reason: string) => `작업이 도는 중에는 업데이트하지 않습니다. ${reason}`,
    // 사용량
    usageFormat: '사용량 정보 형식이 예상과 다릅니다.',
    usageMissing: '사용량 정보를 받지 못했습니다. 구독 계정이 아니거나 서버가 값을 주지 않았습니다.',
    usageFailed: '사용량 조회에 실패했습니다.',
    // Claude Code
    cliTimeout: (seconds: number) => `${seconds}초 안에 응답하지 않았습니다.`,
    exitCode: (code: string) => `종료 코드 ${code}`,
    noExitCode: '없음',
    cliNotFoundInstall: 'Claude Code 를 찾지 못했습니다. 먼저 설치하세요.',
    cliCannotRun: 'Claude Code 를 실행하지 못했습니다.',
    updateTimedOut: '업데이트가 제한 시간 안에 끝나지 않았습니다.',
    installUnsupportedOs: '이 운영체제에서는 앱이 설치 창을 열지 못합니다. 터미널에서 공식 설치 명령을 실행하세요.',
    installAlreadyOpen: '설치 창이 이미 열려 있습니다.',
    cliMissing: 'Claude Code 를 찾지 못했습니다. 설정 화면에서 설치하거나 실행 파일 경로를 지정하세요.',
    authTimeout: '인증 상태 조회가 끝나지 않았습니다.',
    authReadFailed: '인증 상태를 읽지 못했습니다.',
    authFormat: '인증 상태 형식이 예상과 다릅니다.',
    loginAlreadyOpen: '로그인 창이 이미 열려 있습니다.',
    loginUnsupportedOs: '이 운영체제에서는 앱이 로그인 창을 열지 못합니다. 터미널에서 아래 명령을 실행한 뒤 [새로고침]을 누르세요.',
    loginBatchFile: 'CLI 경로가 배치 파일이라 로그인 창을 열 수 없습니다. 터미널에서 아래 명령을 실행하거나, 설정에서 claude.exe 경로를 지정하세요.',
    logoutFailed: '로그아웃에 실패했습니다.',
    invalidLoginMethod: '로그인 방식이 올바르지 않습니다.',
    // 에이전트 세션
    agent: {
      'cli-not-found': 'Claude Code CLI를 찾을 수 없습니다. 설정 화면에서 실행 파일 경로를 지정하세요.',
      'auth-failed': 'Claude Code 계정 인증에 실패했습니다. 아래 설정 폴더에 로그인 정보가 없거나 만료됐습니다.',
      'sdk-load-failed': 'Agent SDK를 불러오지 못했습니다. 설치가 손상되었을 수 있습니다.',
      aborted: '요청을 취소했습니다.',
      unknown: '에이전트 실행 중 오류가 발생했습니다.'
    },
    configDir: (dir: string) => `설정 폴더: ${dir}`,
    accountTimeout: '계정 정보 조회가 20초 안에 끝나지 않았습니다.',
    resultStatus: (subtype: string) => `결과 상태: ${subtype}`
  },

  /** 에이전트 패널에 보이는 도구 호출 요약 */
  panelTools: {
    projectClosed: '프로젝트가 닫혀 있음',
    context: (rows: number, rules: number) => `원문 ${rows}행 · 규칙 ${rules}개`,
    strings: (found: number) => `${found}행`,
    stringsMissing: (missing: number) => ` · 없는 키 ${missing}`,
    glossary: (language: string, terms: number) => `${language} 용어 ${terms}개`,
    noId: 'id 없음',
    ruleProposed: {
      add: '규칙 추가 제안 — 사용자 확인 대기',
      update: '규칙 수정 제안 — 사용자 확인 대기',
      remove: '규칙 삭제 제안 — 사용자 확인 대기'
    },
    termsAdded: (count: number) => `후보 ${count}개 추가(승인 대기)`,
    termsExisting: (count: number) => ` · 이미 있음 ${count}`,
    termsRejected: (count: number) => ` · 거부 ${count}`
  },

  /** 운영체제 파일 선택 창의 제목과 단추 */
  dialogs: {
    projectFolder: '프로젝트 폴더 선택',
    select: '선택',
    sourceCsv: '가져올 원문 CSV 선택',
    unityFolder: 'Unity 프로젝트 폴더 선택',
    link: '연결',
    templateCsv: 'Unity 에서 내보낸 CSV 선택',
    register: '등록'
  },

  /** 원문 저장·가져오기(메인) */
  stringsMain: {
    emptyKeys: (count: number) => `빈 키 ${count}개`,
    duplicateKeys: (keys: string) => `중복 키: ${keys}`,
    keyProblems: '키에 문제가 있어 저장하지 않았습니다.',
    deletedStillPresent: '지울 키가 원문에 남아 있어 저장하지 않았습니다.',
    noHeader: '헤더를 읽을 수 없는 CSV입니다.'
  },

  /** 내보내기(메인) */
  exportMain: {
    templateOutside: '프로젝트 폴더 밖의 경로입니다. 템플릿을 다시 등록하세요.',
    templateMissing: '파일이 없습니다. 템플릿을 다시 등록하세요.',
    templateNoHeader: '헤더(첫 줄)를 읽지 못했습니다.',
    qaShownFirst: (total: number, shown: number) => `QA 오류 ${total}개 중 앞의 ${shown}개만 보여 줍니다.`,
    blocked: '내보내기를 막는 문제가 있습니다.',
    qaBlocked: (count: number) => `QA 오류 ${count}개가 있어 내보내지 않았습니다. 진단 목록에서 고치세요.`,
    overwriteNeeded: '이미 있는 파일을 덮어써야 합니다.',
    writtenIntact: (files: string) => `파일마다 따로 교체하므로 쓴 파일은 온전합니다.${files}`,
    alreadyWritten: (files: string) => ` 이미 쓴 파일: ${files}`,
    noOutputDir: (dir: string) => `${dir} 폴더가 아직 없습니다. 먼저 내보내세요.`,
    openFolderFailed: (error: string) => `폴더를 열지 못했습니다: ${error}`,
    notUnityProject: (problem: string) => `Unity 프로젝트 폴더가 아닙니다: ${problem}`,
    linkUnityFirst: 'Unity 프로젝트를 먼저 연결하세요.',
    templateNoHeaderHint: '헤더(첫 줄)를 읽지 못했습니다. Unity 에서 내보낸 CSV 인지 확인하세요.'
  },

  /** Unity 프로젝트 읽기 */
  unityProject: {
    notAFolder: '폴더가 아닙니다.',
    folderNotFound: '폴더를 찾지 못했습니다.',
    noAssets: 'Assets 폴더가 없습니다. Unity 프로젝트 폴더(Assets 가 있는 폴더)를 고르세요.',
    noProjectSettings: 'ProjectSettings 폴더가 없습니다. Unity 프로젝트 폴더를 고르세요.',
    assetsUnreadable: (error: string) => `Assets 폴더를 읽지 못했습니다: ${error}`,
    fileUnreadable: (file: string) => `${file}: 읽지 못함`,
    allBinary: '에셋이 바이너리로 저장돼 있어 읽을 수 없습니다. Unity 의 Project Settings > Editor > Asset Serialization 을 Force Text 로 바꾸세요.',
    unreadableFiles: (files: string) => ` (읽지 못한 파일: ${files})`,
    nothingFound: (detail: string) =>
      `로케일 에셋과 String Table 공유 데이터 에셋을 찾지 못했습니다. Localization 패키지를 쓰는 프로젝트인지 확인하세요.${detail}`,
    more: (count: number) => ` 외 ${count}개`,
    unreadableAssets: (count: number, files: string, more: string) => `읽지 못한 에셋 ${count}개: ${files}${more}`,
    binarySkipped: (count: number) =>
      `바이너리 에셋 ${count}개는 건너뛰었습니다. NavMesh·LightingData 처럼 Unity 가 늘 바이너리로 두는 파일이면 괜찮고, 로케일·테이블이 빠졌다면 Asset Serialization 을 Force Text 로 바꾸세요.`
  },

  /** 배치 작업·재번역·용어 추가가 남기는 작업 로그와 오류 */
  jobLog: {
    batch: (id: number) => `배치 ${id}`,
    batchStart: (label: string, rows: number) => `${label} 시작 (${rows}행)`,
    fakeLimit: (label: string) => `${label} 사용량 한도 (가짜, BABEL_FAKE_LIMIT)`,
    limitStop: (label: string) => `${label} 사용량 한도 — 모든 작업자를 멈춥니다`,
    aborted: (label: string) => `${label} 중단 — 기록하지 않았습니다`,
    submitRejected: '제출이 검증을 통과하지 못했습니다.',
    agentFailed: '에이전트 실행 중 오류가 났습니다.',
    noSubmission: '에이전트가 결과를 제출하지 않았습니다.',
    failed: (label: string, reason: string) => `${label} 실패: ${reason}`,
    validationFailed: (label: string, tool: string, attempt: number, final: boolean) =>
      `${label} · ${tool} → 검증 실패 (${attempt}번째${final ? ', 더 받지 않음' : ', 수정 대기'})`,
    validationFailedOnce: (label: string, tool: string, attempt: number) => `${label} · ${tool} → 검증 실패 (${attempt}번째)`,
    passedRows: (label: string, tool: string, count: number) => `${label} · ${tool} → ${count}행 통과`,
    passedRowsDropped: (label: string, tool: string, count: number, dropped: number) =>
      `${label} · ${tool} → ${count}행 통과 · 문제가 남은 ${dropped}건은 버림(다시 실행하면 그 행만 돈다)`,
    writeFailed: (label: string) => `${label} 기록 실패`,
    suggestionsWriteFailed: '제안 파일에 기록하지 못했습니다.',
    suggestionsWritten: (label: string, rows: number) => `${label} 제안 기록 (${rows}행)`,
    suggestionsEmpty: (rows: number) => ` · 낼 값이 없던 ${rows}행`,
    noSource: '원문이 없습니다.',
    noRowsSelected: '선택한 행이 없습니다.',
    nothingButPending: (rows: number) => `추정할 행이 없습니다. 승인을 기다리는 제안이 ${rows}행 있습니다.`,
    nothingToInfer: '고른 필드가 모두 채워져 있어 추정할 행이 없습니다.',
    pendingSkippedNote: (rows: number) => `제안 대기 ${rows}행 제외`,
    contextStart: (fields: string, rows: number, batches: number, workers: number, model: string, effort: string) =>
      `컨텍스트 추정 시작: ${fields} · ${rows}행 · 배치 ${batches}개 · 작업자 ${workers} · 모델 ${model} · 사고 ${effort}`,
    pendingSkipped: (rows: number) => `승인을 기다리는 제안이 있는 ${rows}행은 건너뜁니다.`,
    retryLater: '잠시 뒤 다시 시도하세요.',
    resetsAt: (time: string) => `${time}에 풀립니다. 그 뒤에 다시 시도하세요.`,
    limitHit: (reset: string) => `사용량 한도에 걸렸습니다. ${reset}`,
    instruction: (text: string) => ` — 지시: ${text}`,
    rerollLabel: (key: string) => `재번역 ${key}`,
    rerollStart: (key: string, language: string, instruction: string) => `재번역 ${key} (${language}) 시작${instruction}`,
    rerollCandidate: (key: string, confidence: number) => `재번역 ${key} → 후보 받음 (신뢰도 ${confidence})`,
    rerollCancelled: '재번역을 취소했습니다.',
    candidateRejected: '후보가 검증을 통과하지 못했습니다.',
    noCandidate: '에이전트가 후보를 제출하지 않았습니다.',
    cancelledLog: (label: string) => `${label} 취소`,
    cancelled: '취소했습니다.',
    limitLog: (label: string) => `${label} — 사용량 한도`,
    alreadyRunning: (title: string) => `이미 진행 중인 작업이 있습니다: ${title}`,
    noJobRunning: '진행 중인 작업이 없습니다.',
    jobEnded: (title: string, cancelled: boolean, done: string, failed: string, left: string) =>
      `${title} ${cancelled ? '취소됨' : '끝'}: 완료 ${done} · 실패 ${failed} · 남음 ${left}`,
    batchException: '배치 실행 중 예외가 났습니다.',
    termAddLabel: (term: string) => `용어 추가 "${term}"`,
    termRetranslateLabel: (term: string) => `용어 재번역 "${term}"`,
    termStart: (label: string, usages: number, examples: number, instruction: string) =>
      `${label} 시작 · 원문 ${usages}행 중 예문 ${examples}행${instruction}`,
    entryRejected: '에이전트가 낸 항목이 검증을 통과하지 못했습니다.',
    noEntry: '에이전트가 항목을 제출하지 않았습니다.',
    conflicts: (list: string) => ` · 기존 번역과 다른 행 ${list}`,
    enterTerm: '용어를 입력하세요.',
    noTargets: '대상 언어가 없습니다. 프로젝트 화면에서 먼저 정하세요.',
    termExists: (term: string) => `이미 용어집에 있는 용어입니다: ${term}`,
    termNotFound: (term: string) => `원문에서 "${term}" 을 찾지 못했습니다. 원문에 나오는 표기 그대로 입력하세요.`,
    termAddedMeanwhile: (term: string) => `그 사이 같은 용어가 용어집에 들어왔습니다: ${term}`,
    termReloadFailed: '추가한 용어를 다시 읽지 못했습니다.',
    termPending: (label: string, confidence: number, conflicts: string) => `${label} → 승인 대기 (신뢰도 ${confidence})${conflicts}`,
    termNotInGlossary: (term: string) => `용어집에 없는 용어입니다: ${term}`,
    termCandidate: (label: string, confidence: number, conflicts: string) => `${label} → 후보 받음 (신뢰도 ${confidence})${conflicts}`,
    none: '(없음)',
    noteChange: (before: string, after: string) => `지침: ${before} → ${after}`,
    glossarySourceUnreadableLog: (label: string) => `${label} 용어집·원문을 읽지 못했습니다`,
    glossarySourceUnreadable: '용어집·원문을 읽지 못했습니다.',
    termBatchSkipped: (label: string) => `${label} 건너뜀 — 그 사이 칸이 모두 채워졌습니다`,
    termBatchStart: (label: string, terms: number, cells: number) => `${label} 시작 (용어 ${terms}개 · 칸 ${cells}개)`,
    termsPassed: (label: string, tool: string, count: number) => `${label} · ${tool} → 용어 ${count}개 통과`,
    termsPassedDropped: (label: string, tool: string, count: number, dropped: number) =>
      `${label} · ${tool} → 용어 ${count}개 통과 · 문제가 남은 ${dropped}건은 버림(다시 돌리면 그 칸만 채움)`,
    glossaryWriteFailed: '용어집에 기록하지 못했습니다.',
    termsFilled: (label: string, terms: number, cells: number) => `${label} 용어 ${terms}개 채움(${cells}칸)`,
    filledMeanwhile: (count: number) => ` · 그 사이 채워진 ${count}개는 건너뜀`,
    pickLanguages: '번역할 언어를 고르세요. 프로젝트의 대상 언어만 고를 수 있습니다.',
    noTermsSelected: '선택한 용어가 없습니다.',
    noEmptyCells: '고른 언어에 비어 있는 번역 칸이 없습니다.',
    termTranslateStart: (summary: string, terms: number, cells: number, batches: number, workers: number, model: string, effort: string) =>
      `용어 번역 시작: ${summary} · 용어 ${terms}개 · 칸 ${cells}개 · 배치 ${batches}개 · 작업자 ${workers} · 모델 ${model} · 사고 ${effort}`,
    glossaryUnreadableLog: (label: string) => `${label} 용어집을 읽지 못했습니다`,
    glossaryUnreadable: '용어집을 읽지 못했습니다.',
    termsBatchStart: (label: string, rows: number, known: number) => `${label} 시작 (${rows}행) · 이미 있는 용어 ${known}개`,
    candidatesPassed: (label: string, tool: string, count: number) => `${label} · ${tool} → 후보 ${count}개 통과`,
    candidatesPassedDropped: (label: string, tool: string, count: number, dropped: number) =>
      `${label} · ${tool} → 후보 ${count}개 통과 · 문제가 남은 ${dropped}건은 버림`,
    candidatesAdded: (label: string, count: number) => `${label} 후보 ${count}개 추가(승인 대기)`,
    overlapped: (count: number) => ` · 다른 배치와 겹친 ${count}개는 뺌`,
    noSourceForTerms: '용어를 찾을 원문이 없습니다.',
    termsStart: (summary: string, rows: number, batches: number, workers: number, model: string, effort: string) =>
      `용어 추출 시작: ${summary} · ${rows}행 · 배치 ${batches}개 · 작업자 ${workers} · 모델 ${model} · 사고 ${effort}`,
    translateBatchStart: (label: string, rows: number, terms: string) => `${label} 시작 (${rows}행) · ${terms}`,
    remainingIssues: (count: number) => ` · 남은 길이·용어 오류 ${count}건은 검토 화면에서 확인`,
    translationsWriteFailed: '번역 파일에 기록하지 못했습니다.',
    written: (label: string, rows: number) => `${label} 기록 완료 (${rows}행)`,
    writtenKept: (label: string, rows: number, kept: number) => `${label} 기록 완료 (${rows}행) · 작업 중 사람이 고친 ${kept}행은 덮지 않음`,
    noSourceToTranslate: '번역할 원문이 없습니다.',
    nothingButApproved: (rows: number) => `번역할 행이 없습니다. 승인된 ${rows}행은 덮어쓰지 않습니다.`,
    nothingInScope: '이 범위에는 번역할 행이 없습니다.',
    glossaryUnreadableTranslate: '용어집을 읽지 못해 용어 없이 번역합니다.',
    approvedSkippedNote: (rows: number) => `승인 ${rows}행 제외`,
    translateStart: (language: string, scope: string, rows: number, batches: number, workers: number, model: string, effort: string, terms: number) =>
      `번역 시작: ${language} · ${scope} · ${rows}행 · 배치 ${batches}개 · 작업자 ${workers} · 모델 ${model} · 사고 ${effort} · 승인된 용어 ${terms}개 중 배치마다 나오는 것만 넣음`,
    approvedSkipped: (rows: number) => `승인된 ${rows}행은 건너뜁니다.`,
    unconfirmedTerms: (count: number, language: string) =>
      `이 범위에 나오는 승인된 용어 ${count}개는 ${language} 확정 번역이 없어 번역 없이 들어갑니다. 용어집 화면의 [용어 번역]과 [선택 승인]으로 채우면 다음 번역부터 반영됩니다.`
  },

  /** QA 진단 문구(`core/qa/check`) */
  qa: {
    unclosedBrace: '닫히지 않은 {',
    orphanBrace: '짝 없는 }',
    braceAt: (what: string, position: number, around: string) => `${what} — ${position}번째 글자 근처 "${around}"`,
    varsUnreadable: 'vars 열을 읽을 수 없어 빈 목록으로 봅니다.',
    onlyInSource: (names: string) => `원문에만 있음: ${names}`,
    onlyInVars: (names: string) => `vars 에만 있음: ${names}`,
    varsMismatch: 'vars 열의 변수 이름이 원문과 다릅니다.',
    varsMismatchHint: '기준은 원문입니다. 어느 쪽이 맞는지 확인해 vars 열을 고치세요.',
    empty: '번역문이 비어 있습니다.',
    stale: '번역한 뒤 원문이 바뀌었습니다. 새 원문과 비교해 주세요.',
    braces: '중괄호 짝이 맞지 않습니다.',
    missingVars: (names: string) => `원문의 변수가 번역문에 없습니다: ${names}`,
    extraVars: (names: string) => `원문에 없는 변수가 번역문에 있습니다: ${names}`,
    unknownFormatters: (names: string) => `포매터 목록에 없는 이름: ${names}`,
    unknownFormattersHint: 'project.json 의 smartStrings.formatters 에 없습니다. 커스텀 포매터라면 목록에 추가하세요.',
    tagsMissing: (tags: string) => `빠짐: ${tags}`,
    tagsExtra: (tags: string) => `추가됨: ${tags}`,
    tagsMismatch: '리치 텍스트 태그가 원문과 다릅니다.',
    tagsUnclosed: (tags: string) => `닫히지 않음: ${tags}`,
    tagsOrphan: (tags: string) => `여는 태그 없이 닫힘: ${tags}`,
    tagsCrossed: (tags: string) => `중첩 순서 어긋남: ${tags}`,
    tagsUnpaired: '태그 짝이 맞지 않습니다.',
    noExample: (name: string) => `{${name}} 은 example 이 없어 자리표시자 그대로 셈`,
    example: (name: string, value: string) => `{${name}} = "${value}"`,
    lengthRule: '태그는 빼고, 분기가 있는 포매터는 가장 긴 분기로 셌습니다.',
    tooLong: (length: number, max: number) => `길이 초과: ${length} / ${max}자`,
    glossary: (term: string, translation: string) => `용어집 번역을 쓰지 않았습니다: ${term} → ${translation}`
  },

  /** 컨텍스트 제안 값 검사(`core/context/suggestions`) */
  contextCheck: {
    maxLenInteger: '최대 길이는 1 이상의 정수여야 합니다.',
    varsInvalid: (reason: string) => `vars 형식이 올바르지 않습니다: ${reason}`
  },

  /** 내보내기 계획(`core/export`) */
  exportCheck: {
    noKeyColumn: (column: string) => `${column} 열이 없습니다. Unity 는 키 열 없이 가져오지 못합니다.`,
    emptyColumnName: '이름이 빈 열이 있습니다.',
    duplicateColumnNames: (names: string) => `열 이름이 겹칩니다: ${names}`,
    duplicateRoles: (names: string) => `같은 내용을 두 번 쓰는 열이 있습니다: ${names}`,
    missingUnityLocale: (code: string, language: string) => `Unity 프로젝트에 ${code} 로케일이 없습니다(${language}). Unity 는 이 열을 가져오지 않습니다.`,
    unityUnreadable: (reason: string) => `Unity 프로젝트를 읽지 못해 기본 자동 생성으로 내보냅니다: ${reason}`,
    noLanguages: '내보낼 언어를 고르세요.',
    templateUnreadable: (reason: string) => `템플릿을 읽지 못해 자동 생성 헤더를 씁니다: ${reason}`,
    templateReinferred: '템플릿 헤더가 저장된 매핑과 달라 열 역할을 다시 추론했습니다. 확인한 뒤 매핑을 저장하세요.',
    templateOmitted: (count: number, names: string) => `템플릿 열 ${count}개는 내보내지 않습니다: ${names}`,
    templateUnmapped: (languages: string) => `템플릿에 값 열이 없어 내보내지 않는 언어: ${languages}`,
    noSource: '원문이 없습니다.',
    chooseCollection: 'String Table 컬렉션이 여럿입니다. 하나를 고르면 기존 키의 Id 를 채웁니다.',
    collectionMissing: (name: string) => `고른 컬렉션 "${name}" 을 찾지 못했습니다. Id 를 비웁니다.`,
    noSharedTable: 'String Table 공유 데이터 에셋을 찾지 못했습니다. Id 를 비웁니다.',
    yamlError: (error: string) => `YAML 오류: ${error}`,
    localeCodeEmpty: '로케일 코드(m_Identifier.m_Code)가 비어 있습니다.',
    localeCodeMissing: 'm_Identifier.m_Code 를 찾지 못했습니다.',
    sharedTableMissing: 'm_TableCollectionName·m_Entries 를 찾지 못했습니다.'
  },

  /** 스타일 규칙 바꾸기(`core/project/rules`) */
  ruleCheck: {
    empty: '규칙 내용이 비어 있습니다.',
    tooLong: (max: number) => `규칙은 ${max}자 이내로 적어 주세요.`,
    duplicate: (id: string) => `같은 규칙이 이미 있습니다(${id}).`,
    unknownId: (id: string) => `규칙 ${id} 이 없습니다.`,
    unchanged: '바뀐 내용이 없습니다.'
  },

  /** 프로젝트 설정 검사(`core/project/settings`) */
  settingsCheck: {
    nameRequired: '프로젝트 이름을 입력하세요.',
    notLanguageCode: (code: string) => `언어 코드가 아닙니다: "${code}"`,
    notLanguageCodes: (codes: string) => `언어 코드가 아닙니다: ${codes}`,
    duplicateLanguages: (codes: string) => `중복된 언어: ${codes}`,
    sourceAsTarget: '원문 언어를 대상 언어로 둘 수 없습니다.',
    emptyRule: '비어 있는 규칙이 있습니다. 내용을 쓰거나 지우세요.',
    duplicateRuleIds: '규칙 id 가 겹칩니다.',
    positiveInteger: '1 이상의 정수를 입력하세요.',
    integerRange: (max: number) => `1~${max} 사이의 정수를 입력하세요.`,
    zeroToOne: '0~1 사이의 숫자를 입력하세요.',
    numberRange: (max: number) => `1~${max} 사이의 숫자를 입력하세요.`,
    oneCharacter: '글자 하나를 입력하세요.',
    braceEscape: '중괄호는 이스케이프 문자로 쓸 수 없습니다.',
    formatterNames: (names: string) => `포매터 이름은 영문·숫자·_ 만 씁니다: ${names}`,
    localeCode: (language: string, code: string) => `${language}: 로케일 코드가 올바르지 않습니다: "${code}"`,
    columnWhitespace: (language: string) => `${language}: 열 이름 앞뒤에 공백이나 줄바꿈을 둘 수 없습니다.`,
    reservedColumn: (language: string, name: string) => `${language}: "${name}" 은 Unity 가 쓰는 열 이름입니다.`,
    duplicateColumn: (languages: string, name: string) => `${languages}: 열 이름 "${name}" 이 겹칩니다.`
  },

  /** 번역 상태 바꾸기(`core/status`) */
  statusCheck: {
    staleManual: '원문변경(stale)은 원문이 바뀔 때만 붙습니다. 번역을 고치면 초안으로 바뀝니다.',
    emptyWithStatus: (status: string) => `빈 번역은 ${status} 상태로 둘 수 없습니다. 비우면 미번역이 됩니다.`,
    textAsUntranslated: '번역문이 있는 행은 미번역 상태로 둘 수 없습니다.'
  },

  /** 배치에 넣은 용어를 작업 로그 한 줄로(`core/translate/glossary`) */
  injectedTerms: {
    none: '용어 0개',
    list: (count: number, names: string) => `용어 ${count}개: ${names}`
  },

  /** 앱 업데이트 오류(`core/update/app-update`) */
  updateErrors: {
    offline: '인터넷에 연결할 수 없습니다. 네트워크를 확인한 뒤 다시 시도하세요.',
    notPublished: '공개된 릴리스에서 업데이트 정보를 찾지 못했습니다. 잠시 뒤 다시 확인하세요.',
    checksum: '받은 파일이 릴리스 정보와 맞지 않아 버렸습니다. 다시 받으세요.',
    fileLocked: '업데이트 파일을 쓰지 못했습니다. 백신 프로그램이 파일을 검사 중인지 확인하고 다시 시도하세요.',
    serverError: 'GitHub 서버가 응답하지 않습니다. 잠시 뒤 다시 시도하세요.',
    checkFailed: '업데이트를 확인하지 못했습니다.',
    downloadFailed: '업데이트를 받지 못했습니다.'
  }
}

export type Messages = typeof ko
