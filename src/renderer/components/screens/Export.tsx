import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ExportColumnOrigin,
  ExportMissing,
  ExportPreview,
  ExportRequest,
  ExportResult,
  TemplateColumn
} from '@shared/schema/export'
import type { OpenProject, ProjectSettingsPatch } from '@shared/schema/project'
import type { IpcError, IpcResult } from '@shared/types'
import { RULE_LABEL } from '../../state/review'
import { ConfirmDialog } from '../ConfirmDialog'
import { TokenText } from '../TokenText'
import type { ReviewFocus } from './Review'

const api = window.babel

type Props = {
  project: OpenProject
  /** project.json 의 내보내기 옵션 저장 */
  onSettings: (patch: ProjectSettingsPatch) => Promise<IpcResult<OpenProject>>
  /** Unity 연결·템플릿 등록처럼 메인이 project.json 을 고친 뒤 */
  onProjectReplaced: (project: OpenProject) => void
  onOpenReview: (focus: ReviewFocus) => void
  onOpenProjectSettings: () => void
  onMessage: (text: string) => void
}

type Options = Pick<ExportRequest, 'sharedComments' | 'localeComments' | 'missing' | 'glyphs'>

const ORIGIN_LABEL: Record<ExportColumnOrigin, string> = {
  auto: '자동',
  setting: '설정',
  unity: 'Unity',
  template: '템플릿'
}

const MISSING_OPTIONS: { value: ExportMissing; label: string; hint: string }[] = [
  { value: 'empty', label: '비우기', hint: 'Unity 의 기존 번역이 빈 값으로 덮입니다.' },
  { value: 'source', label: '원문 넣기', hint: '원문을 그대로 넣습니다.' },
  { value: 'skip', label: '행 빼기', hint: '비는 행을 뺍니다. CSV(Merge)... 로 가져오세요.' }
]

const ROLE_LABEL: Record<Exclude<TemplateColumn['role'], 'value' | 'comments'>, string> = {
  key: 'Key',
  id: 'Id',
  sharedComments: 'Shared Comments (컨텍스트)',
  omit: '내보내지 않음'
}

/** 템플릿 매핑 선택 상자의 값: `역할:언어` */
const roleValue = (column: TemplateColumn): string => `${column.role}:${column.language}`

function parseRoleValue(name: string, value: string): TemplateColumn {
  const [role = 'omit', language = ''] = value.split(':')
  switch (role) {
    case 'key':
    case 'id':
    case 'sharedComments':
    case 'omit':
      return { name, role, language: '' }
    case 'value':
    case 'comments':
      return { name, role, language }
    default:
      return { name, role: 'omit', language: '' }
  }
}

function pickOptions(config: OpenProject['config']): Options {
  const { sharedComments, localeComments, missing, glyphs } = config.export
  return { sharedComments, localeComments, missing, glyphs }
}

/**
 * Unity Localization CSV 내보내기. 기본은 템플릿 없이 자동 생성하고, Unity 프로젝트 연결과 템플릿은 선택이다.
 * 미리보기는 쓰지 않고 계산만 한다. [내보내기]를 누르면 메인이 다시 읽고 다시 검사한 뒤 export/ 에 쓴다.
 */
export function Export({ project, onSettings, onProjectReplaced, onOpenReview, onOpenProjectSettings, onMessage }: Props): React.JSX.Element {
  const { config } = project
  const allLanguages = useMemo(() => [config.sourceLanguage, ...config.targetLanguages], [config.sourceLanguage, config.targetLanguages])
  const [languages, setLanguages] = useState<string[]>(allLanguages)
  const [options, setOptions] = useState<Options>(() => pickOptions(config))
  const [fileName, setFileName] = useState(config.export.fileName)
  const [preview, setPreview] = useState<ExportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<IpcError | null>(null)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [confirmFiles, setConfirmFiles] = useState<string[] | null>(null)
  /** 화면에서 고친 템플릿 매핑. 저장하기 전까지 미리보기는 저장된 매핑을 쓴다 */
  const [mappingDraft, setMappingDraft] = useState<TemplateColumn[] | null>(null)

  // 프로젝트 언어가 바뀌면 고른 언어도 맞춘다(빠진 언어는 빼고 새 언어는 넣는다)
  const knownLanguages = useRef(allLanguages)
  useEffect(() => {
    const before = knownLanguages.current
    knownLanguages.current = allLanguages
    setLanguages((prev) => allLanguages.filter((language) => prev.includes(language) || !before.includes(language)))
  }, [allLanguages])

  useEffect(() => {
    setOptions(pickOptions(config))
  }, [config])

  const request: ExportRequest = useMemo(() => ({ languages, ...options, fileName }), [languages, options, fileName])
  const requestRef = useRef(request)
  requestRef.current = request

  const sequence = useRef(0)
  const refresh = useCallback(async (next: ExportRequest) => {
    const id = ++sequence.current
    setLoading(true)
    const loaded = await api.export.preview(next)
    if (id !== sequence.current) return
    setLoading(false)
    if (!loaded.ok) {
      setError(loaded.error)
      return
    }
    setError(null)
    setPreview(loaded.value)
  }, [])

  // 옵션·언어·파일 이름·project.json 이 바뀌면 다시 계산한다. 입력 중에는 잠깐 기다린다
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(request), 200)
    return () => window.clearTimeout(timer)
  }, [request, config, refresh])

  // 원문·번역·용어집 파일이 바뀌면(앱 밖 편집, 작업 기록) 다시 계산한다
  useEffect(() => {
    const offFile = api.strings.onFileChanged(() => void refresh(requestRef.current))
    const offData = api.project.onDataWritten(() => void refresh(requestRef.current))
    let lastDone = -1
    const offJob = api.jobs.onUpdate((view) => {
      if (view.snapshot.doneRows === lastDone) return
      lastDone = view.snapshot.doneRows
      void refresh(requestRef.current)
    })
    return () => {
      offFile()
      offData()
      offJob()
    }
  }, [refresh])

  /** 옵션은 고르는 즉시 project.json 에 저장한다(다음에 열 때도 같은 옵션) */
  const saveOptions = async (patch: Partial<Options>): Promise<void> => {
    setOptions((prev) => ({ ...prev, ...patch }))
    const saved = await onSettings({ export: patch })
    if (!saved.ok) onMessage(saved.error.message)
  }

  const saveFileName = async (): Promise<void> => {
    if (fileName.trim() === config.export.fileName) return
    const saved = await onSettings({ export: { fileName } })
    if (!saved.ok) onMessage(saved.error.message)
  }

  /** 메인이 project.json 을 고치는 동작(Unity 연결·템플릿). 취소는 조용히 넘긴다 */
  const projectAction = async (action: () => Promise<IpcResult<OpenProject>>, done: string): Promise<void> => {
    setBusy(true)
    try {
      const changed = await action()
      if (!changed.ok) {
        if (changed.error.kind !== 'cancelled') setError(changed.error)
        return
      }
      setError(null)
      setMappingDraft(null)
      onProjectReplaced(changed.value)
      onMessage(done)
    } finally {
      setBusy(false)
    }
  }

  const reloadUnity = async (): Promise<void> => {
    setBusy(true)
    try {
      const reloaded = await api.export.reloadUnity()
      if (!reloaded.ok) setError(reloaded.error)
      await refresh(requestRef.current)
    } finally {
      setBusy(false)
    }
  }

  const runExport = async (overwrite: boolean): Promise<void> => {
    setConfirmFiles(null)
    setBusy(true)
    try {
      const written = await api.export.run(requestRef.current, overwrite)
      if (!written.ok) {
        if (written.error.kind === 'conflict') {
          setConfirmFiles((written.error.detail ?? '').split('\n').filter((name) => name !== ''))
          return
        }
        setError(written.error)
        return
      }
      setError(null)
      setResult(written.value)
      onMessage(`${written.value.outputDir}/ 에 파일 ${written.value.files.length}개를 내보냈습니다.`)
      await refresh(requestRef.current)
    } finally {
      setBusy(false)
    }
  }

  const startExport = (): void => {
    if (!preview) return
    const existing = preview.files.filter((file) => file.exists).map((file) => file.name)
    if (existing.length > 0) setConfirmFiles(existing)
    else void runExport(false)
  }

  const saveMapping = async (columns: TemplateColumn[]): Promise<void> => {
    setBusy(true)
    try {
      const saved = await onSettings({ export: { templateColumns: columns } })
      if (!saved.ok) {
        setError(saved.error)
        return
      }
      setMappingDraft(null)
      onMessage('템플릿 열 매핑을 저장했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const toggleLanguage = (language: string, checked: boolean): void => {
    setLanguages((prev) => (checked ? allLanguages.filter((item) => item === language || prev.includes(item)) : prev.filter((item) => item !== language)))
  }

  const missingHint = MISSING_OPTIONS.find((item) => item.value === options.missing)?.hint ?? ''
  const unity = preview?.unity ?? null
  const template = preview?.template ?? null
  const mapping = template?.state === 'ok' ? (mappingDraft ?? template.columns) : []
  // 저장된 매핑이 없으면(옛 unityTemplate 에서 옮긴 경우) 추론 결과를 그대로 저장할 수 있게 한다
  const mappingSaved = (config.export.template?.columns.length ?? 0) > 0
  const mappingDirty = template?.state === 'ok' && (mappingDraft !== null || template.reinferred || !mappingSaved)
  const blocked = preview === null || preview.blocked
  const errorCount = preview?.qaErrors.length ?? 0

  return (
    <div className="export-screen">
      <div className="strings-header">
        <h2 className="screen-title">내보내기</h2>
        <div className="row">
          <button type="button" disabled={loading || busy} onClick={() => void refresh(request)}>
            {loading ? '계산 중…' : '다시 계산'}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || loading || blocked}
            title={preview?.blocked ? '막는 문제를 먼저 고치세요' : undefined}
            onClick={startExport}
          >
            내보내기
          </button>
        </div>
      </div>

      {error ? (
        <div className="message error">
          <strong>{error.message}</strong>
          {error.detail ? <pre>{error.detail}</pre> : null}
        </div>
      ) : null}

      {result ? (
        <div className="message ok">
          <strong>내보냈습니다</strong> — {result.outputDir}/ 에 {result.files.join(', ')} · {result.summary.rows}행
          {result.smartCount > 0 ? ` · Smart 항목 ${result.smartCount}개` : ''}
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <button
              type="button"
              onClick={() =>
                void api.export.reveal().then((opened) => {
                  if (!opened.ok) onMessage(opened.error.message)
                })
              }
            >
              폴더 열기
            </button>
          </div>
        </div>
      ) : null}

      <section className="card">
        <h3>언어와 옵션</h3>
        <div className="export-languages">
          <span className="field-label">내보낼 언어</span>
          <div className="check-row">
            {allLanguages.map((language) => (
              <label key={language} className="check">
                <input
                  type="checkbox"
                  checked={languages.includes(language)}
                  onChange={(event) => toggleLanguage(language, event.target.checked)}
                />
                <code>{language}</code>
                {language === config.sourceLanguage ? <span className="check-note">원문</span> : null}
              </label>
            ))}
          </div>
        </div>
        <div className="check-list">
          <label className="check">
            <input
              type="checkbox"
              checked={options.sharedComments}
              onChange={(event) => void saveOptions({ sharedComments: event.target.checked })}
            />
            <span>Shared Comments 열에 컨텍스트(context) 넣기</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={options.localeComments}
              onChange={(event) => void saveOptions({ localeComments: event.target.checked })}
            />
            <span>언어별 Comments 열에 번역 메모(note) 넣기</span>
          </label>
          {options.sharedComments || options.localeComments ? (
            <p className="hint">빈 주석 칸은 Unity 의 기존 주석을 지웁니다.</p>
          ) : null}
          <label className="check">
            <input type="checkbox" checked={options.glyphs} onChange={(event) => void saveOptions({ glyphs: event.target.checked })} />
            <span>언어별 글자 목록 파일도 만들기(폰트 아틀라스용)</span>
          </label>
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">미번역·원문 변경 칸</span>
            <select
              value={options.missing}
              onChange={(event) => {
                const next = MISSING_OPTIONS.find((item) => item.value === event.target.value)
                if (next) void saveOptions({ missing: next.value })
              }}
            >
              {MISSING_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <span className="hint">{missingHint}</span>
          </label>
          <label className="field">
            <span className="field-label">파일 이름 (확장자 제외)</span>
            <input
              value={fileName}
              placeholder={preview ? preview.files[0]?.name.replace(/\.csv$/, '') : ''}
              onChange={(event) => setFileName(event.target.value)}
              onBlur={() => void saveFileName()}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h3>Unity 프로젝트 (선택)</h3>
        {unity === null || unity.state === 'none' ? (
          <>
            <p className="hint">로케일 코드와 기존 키 Id 를 읽어 옵니다. Unity 프로젝트에는 쓰지 않습니다.</p>
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.linkUnity, 'Unity 프로젝트를 연결했습니다.')}>
                Unity 프로젝트 연결
              </button>
            </div>
          </>
        ) : unity.state === 'failed' ? (
          <>
            <div className="message error" style={{ marginTop: 0 }}>
              <strong>Unity 프로젝트를 읽지 못했습니다</strong> — 기본 자동 생성으로 내보냅니다.
              <pre>{unity.reason}</pre>
            </div>
            <p className="hint">
              폴더: <code>{unity.projectPath}</code>
            </p>
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" disabled={busy} onClick={() => void reloadUnity()}>
                다시 읽기
              </button>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.linkUnity, 'Unity 프로젝트를 연결했습니다.')}>
                다른 폴더
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => void projectAction(api.export.unlinkUnity, 'Unity 연결을 풀었습니다.')}>
                연결 해제
              </button>
            </div>
          </>
        ) : (
          <>
            <dl className="dl">
              <dt>폴더</dt>
              <dd>{unity.projectPath}</dd>
              <dt>로케일</dt>
              <dd>{unity.locales.length === 0 ? '없음' : unity.locales.map((locale) => locale.code).join(', ')}</dd>
              <dt>컬렉션</dt>
              <dd>
                {unity.collections.length > 1 ? (
                  <select
                    value={unity.tableCollection ?? ''}
                    disabled={busy}
                    onChange={(event) =>
                      void projectAction(() => api.export.selectCollection(event.target.value), '컬렉션을 골랐습니다.')
                    }
                  >
                    <option value="">(고르세요)</option>
                    {unity.collections.map((collection) => (
                      <option key={collection.name} value={collection.name}>
                        {collection.name} · 키 {collection.entries}개
                      </option>
                    ))}
                  </select>
                ) : (
                  (unity.tableCollection ?? '없음')
                )}
              </dd>
              <dt>키 Id</dt>
              <dd>
                찾음 {unity.idFound} · 새 키 {unity.newKeys} · Unity 에만 있음 {unity.unityOnlyKeys}
              </dd>
            </dl>
            {unity.unityOnlyKeys > 0 ? (
              <p className="hint field-error">
                Unity 에만 있는 키 {unity.unityOnlyKeys}개는 CSV... 로 가져오면 지워집니다. CSV(Merge)... 로 가져오세요.
              </p>
            ) : null}
            {unity.notices.map((notice) => (
              <p key={notice} className="hint">
                {notice}
              </p>
            ))}
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" disabled={busy} onClick={() => void reloadUnity()}>
                다시 읽기
              </button>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.linkUnity, 'Unity 프로젝트를 연결했습니다.')}>
                다른 폴더
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => void projectAction(api.export.unlinkUnity, 'Unity 연결을 풀었습니다.')}>
                연결 해제
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h3>템플릿 (선택)</h3>
        {template === null || template.state === 'none' ? (
          <>
            <p className="hint">Unity CSV 확장의 열 구성을 바꾼 경우에만 필요합니다.</p>
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.setTemplate, '템플릿을 등록했습니다.')}>
                템플릿 등록
              </button>
            </div>
          </>
        ) : template.state === 'failed' ? (
          <>
            <div className="message error" style={{ marginTop: 0 }}>
              <strong>템플릿을 읽지 못했습니다</strong> — 자동 생성 헤더를 씁니다.
              <pre>
                {template.path}: {template.reason}
              </pre>
            </div>
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.setTemplate, '템플릿을 등록했습니다.')}>
                다시 등록
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => void projectAction(api.export.clearTemplate, '템플릿 등록을 풀었습니다.')}>
                등록 해제
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              <code>{template.path}</code> · 열 {template.header.length}개
            </p>
            <table className="locale-table template-table">
              <thead>
                <tr>
                  <th>템플릿 열</th>
                  <th>역할</th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((column, index) => (
                  <tr key={`${index}:${column.name}`}>
                    <td>
                      <code>{column.name}</code>
                    </td>
                    <td>
                      <select
                        value={roleValue(column)}
                        disabled={busy}
                        onChange={(event) =>
                          setMappingDraft(mapping.map((item, at) => (at === index ? parseRoleValue(item.name, event.target.value) : item)))
                        }
                      >
                        {(['key', 'id', 'sharedComments'] as const).map((role) => (
                          <option key={role} value={`${role}:`}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                        {allLanguages.map((language) => (
                          <option key={`value:${language}`} value={`value:${language}`}>
                            값 · {language}
                          </option>
                        ))}
                        {allLanguages.map((language) => (
                          <option key={`comments:${language}`} value={`comments:${language}`}>
                            주석(메모) · {language}
                          </option>
                        ))}
                        <option value="omit:">{ROLE_LABEL.omit}</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" className="primary" disabled={busy || !mappingDirty} onClick={() => void saveMapping(mapping)}>
                매핑 저장
              </button>
              <button type="button" disabled={busy || mappingDraft === null} onClick={() => setMappingDraft(null)}>
                되돌리기
              </button>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.setTemplate, '템플릿을 다시 등록했습니다.')}>
                다시 등록
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => void projectAction(api.export.clearTemplate, '템플릿 등록을 풀었습니다.')}>
                등록 해제
              </button>
            </div>
          </>
        )}
      </section>

      {preview ? (
        <>
          <section className="card wide">
            <h3>
              헤더 미리보기 <span className="hint">· {preview.headerSource === 'template' ? '템플릿' : '자동 생성'}</span>
            </h3>
            <div className="header-chips">
              {preview.columns.map((column, index) => (
                <span key={`${index}:${column.name}`} className="chip header-chip">
                  <code>{column.name}</code>
                  <span className="header-chip-origin">{ORIGIN_LABEL[column.origin]}</span>
                </span>
              ))}
            </div>
            {preview.problems.map((problem) => (
              <p key={problem} className="hint field-error">
                {problem}
              </p>
            ))}
            {preview.warnings.map((warning) => (
              <p key={warning} className="hint export-warning">
                {warning}
              </p>
            ))}
            {preview.languages.length > 0 ? (
              <table className="locale-table" style={{ marginTop: 'var(--space-3)' }}>
                <thead>
                  <tr>
                    <th>언어</th>
                    <th>Unity 로케일 코드</th>
                    <th>열 이름</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.languages.map((language) => (
                    <tr key={language.language}>
                      <td>
                        <code>{language.language}</code>
                        {language.isSource ? <span className="hint"> 원문</span> : null}
                      </td>
                      <td>
                        <code>{language.unityLocaleCode}</code>
                        <span className="hint">
                          {' '}
                          {language.codeOrigin === 'setting' ? '설정' : language.codeOrigin === 'unity' ? 'Unity' : '프로젝트 코드'}
                        </span>
                      </td>
                      <td>
                        <code>{language.columnName}</code>
                        <span className="hint"> {language.nameOrigin === 'setting' ? '설정' : '자동'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <div className="row" style={{ marginTop: 'var(--space-2)' }}>
              <button type="button" className="ghost" onClick={onOpenProjectSettings}>
                코드·열 이름 고치기
              </button>
            </div>
            <p className="hint">열 이름이 Unity 와 다르면 그 열은 무시됩니다.</p>
            {preview.sampleRows.length > 0 ? (
              <div className="sample">
                <table>
                  <thead>
                    <tr>
                      {preview.columns.map((column, index) => (
                        <th key={`${index}:${column.name}`}>{column.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sampleRows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} title={cell}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="card wide">
            <h3>QA</h3>
            {errorCount === 0 ? (
              <p className="hint">QA 오류 없음 · 경고 {preview.qaWarnings}개</p>
            ) : (
              <>
                <p className="hint field-error">QA 오류가 있어 내보낼 수 없습니다 · 경고 {preview.qaWarnings}개</p>
                <ul className="export-qa-list">
                  {preview.qaErrors.map((item, index) => (
                    <li key={`${item.language}:${item.key}:${item.ruleId}:${index}`} className="export-qa-item">
                      <span className="badge error">{item.language}</span>
                      <code className="token-key">{item.key}</code>
                      <span className="diagnostic-message">
                        <span className="diagnostic-rule">{RULE_LABEL[item.ruleId]}</span> {item.message}
                      </span>
                      <button type="button" className="ghost" onClick={() => onOpenReview({ language: item.language, key: item.key })}>
                        검토에서 보기
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {preview.qaNotices.map((notice) => (
              <p key={notice} className="hint">
                {notice}
              </p>
            ))}
          </section>

          <section className="card wide">
            <h3>Smart 항목 {preview.smart.length}개</h3>
            <p className="hint">Unity CSV 는 Smart 여부를 옮기지 않습니다. Unity 에서 직접 표시하세요.</p>
            {preview.smartUnset > 0 ? (
              <p className="hint export-warning">
                Smart 여부가 미정인 행이 {preview.smartUnset}개 있습니다(원문 화면의 [Smart 제안 적용]).
              </p>
            ) : null}
            {preview.smart.length > 0 ? (
              <ul className="export-smart-list">
                {preview.smart.map((item) => (
                  <li key={item.key}>
                    <code className="token-key">{item.key}</code>
                    {item.id !== '' ? <span className="hint mono"> {item.id}</span> : null}
                    <TokenText className="export-smart-source" text={item.source} syntax={config.smartStrings} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="card wide">
            <h3>요약</h3>
            <dl className="dl">
              <dt>내보낼 행</dt>
              <dd>
                {preview.summary.rows}
                {preview.summary.skippedRows > 0
                  ? ` · 뺀 행 ${preview.summary.skippedRows} (${preview.summary.skippedKeys.join(', ')}${preview.summary.skippedRows > preview.summary.skippedKeys.length ? ' …' : ''})`
                  : ''}
              </dd>
              {preview.summary.languages.map((language) => (
                <div key={language.language} style={{ display: 'contents' }}>
                  <dt>{language.language}</dt>
                  <dd>
                    채움 {language.filled} · 비움 {language.blank}
                    {language.sourceFilled > 0 ? ` · 원문으로 ${language.sourceFilled}` : ''}
                  </dd>
                </div>
              ))}
              <dt>출력</dt>
              <dd>
                {preview.files.map((file) => (
                  <div key={file.name}>
                    {preview.outputDir}/{file.name}
                    {file.exists ? <span className="hint"> (있음 · 덮어씀)</span> : null}
                  </div>
                ))}
              </dd>
            </dl>
            <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
              Unity 에서는 <strong>CSV(Merge)...</strong> 로 가져오세요. <strong>CSV...</strong> 는 파일에 없는 키를 지웁니다.
            </p>
          </section>
        </>
      ) : loading ? (
        <p className="hint">계산 중…</p>
      ) : null}

      {confirmFiles !== null ? (
        <ConfirmDialog title="파일 덮어쓰기" confirmLabel="덮어쓰기" danger onCancel={() => setConfirmFiles(null)} onConfirm={() => void runExport(true)}>
          <p>{preview?.outputDir ?? 'export'}/ 에 이미 있는 파일을 새로 씁니다.</p>
          <ul>
            {confirmFiles.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
