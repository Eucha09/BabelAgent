import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ExportMissing,
  ExportPreview,
  ExportRequest,
  ExportResult,
  TemplateColumn
} from '@shared/schema/export'
import type { OpenProject, ProjectSettingsPatch } from '@shared/schema/project'
import type { IpcError, IpcResult } from '@shared/types'
import { useT } from '../../i18n'
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

/** 미번역·원문 변경 칸 선택지 순서. 이름과 설명은 카탈로그 `exportScreen.missing` */
const MISSING_VALUES: readonly ExportMissing[] = ['empty', 'source', 'skip']

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
  const t = useT()
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
      onMessage(t.exportScreen.exportedMessage(written.value.outputDir, written.value.files.length))
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
      onMessage(t.exportScreen.mappingSaved)
    } finally {
      setBusy(false)
    }
  }

  const toggleLanguage = (language: string, checked: boolean): void => {
    setLanguages((prev) => (checked ? allLanguages.filter((item) => item === language || prev.includes(item)) : prev.filter((item) => item !== language)))
  }

  const missingHint = t.exportScreen.missing[options.missing].hint
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
        <h2 className="screen-title">{t.screens.export.label}</h2>
        <div className="row">
          <button type="button" disabled={loading || busy} onClick={() => void refresh(request)}>
            {loading ? t.exportScreen.calculating : t.exportScreen.recalculate}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || loading || blocked}
            title={preview?.blocked ? t.exportScreen.blockedHint : undefined}
            onClick={startExport}
          >
            {t.exportScreen.export}
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
          <strong>{t.exportScreen.exported}</strong>
          {t.exportScreen.exportedDetail(result.outputDir, result.files.join(', '), result.summary.rows)}
          {result.smartCount > 0 ? t.exportScreen.smartCount(result.smartCount) : ''}
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <button
              type="button"
              onClick={() =>
                void api.export.reveal().then((opened) => {
                  if (!opened.ok) onMessage(opened.error.message)
                })
              }
            >
              {t.exportScreen.openFolder}
            </button>
          </div>
        </div>
      ) : null}

      <section className="card">
        <h3>{t.exportScreen.languagesAndOptions}</h3>
        <div className="export-languages">
          <span className="field-label">{t.exportScreen.languagesToExport}</span>
          <div className="check-row">
            {allLanguages.map((language) => (
              <label key={language} className="check">
                <input
                  type="checkbox"
                  checked={languages.includes(language)}
                  onChange={(event) => toggleLanguage(language, event.target.checked)}
                />
                <code>{language}</code>
                {language === config.sourceLanguage ? <span className="check-note">{t.exportScreen.source}</span> : null}
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
            <span>{t.exportScreen.sharedComments}</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={options.localeComments}
              onChange={(event) => void saveOptions({ localeComments: event.target.checked })}
            />
            <span>{t.exportScreen.localeComments}</span>
          </label>
          {options.sharedComments || options.localeComments ? (
            <p className="hint">{t.exportScreen.commentsWarning}</p>
          ) : null}
          <label className="check">
            <input type="checkbox" checked={options.glyphs} onChange={(event) => void saveOptions({ glyphs: event.target.checked })} />
            <span>{t.exportScreen.glyphs}</span>
          </label>
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">{t.exportScreen.missingLabel}</span>
            <select
              value={options.missing}
              onChange={(event) => {
                const next = MISSING_VALUES.find((value) => value === event.target.value)
                if (next) void saveOptions({ missing: next })
              }}
            >
              {MISSING_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t.exportScreen.missing[value].label}
                </option>
              ))}
            </select>
            <span className="hint">{missingHint}</span>
          </label>
          <label className="field">
            <span className="field-label">{t.exportScreen.fileName}</span>
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
        <h3>{t.exportScreen.unity}</h3>
        {unity === null || unity.state === 'none' ? (
          <>
            <p className="hint">{t.exportScreen.unityHint}</p>
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.linkUnity, t.exportScreen.linked)}>
                {t.exportScreen.linkUnity}
              </button>
            </div>
          </>
        ) : unity.state === 'failed' ? (
          <>
            <div className="message error" style={{ marginTop: 0 }}>
              <strong>{t.exportScreen.unityFailed}</strong>
              {t.exportScreen.unityFallback}
              <pre>{unity.reason}</pre>
            </div>
            <p className="hint">
              {t.exportScreen.folderLabel}
              <code>{unity.projectPath}</code>
            </p>
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" disabled={busy} onClick={() => void reloadUnity()}>
                {t.exportScreen.reload}
              </button>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.linkUnity, t.exportScreen.linked)}>
                {t.exportScreen.otherFolder}
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => void projectAction(api.export.unlinkUnity, t.exportScreen.unlinked)}>
                {t.exportScreen.unlink}
              </button>
            </div>
          </>
        ) : (
          <>
            <dl className="dl">
              <dt>{t.exportScreen.folder}</dt>
              <dd>{unity.projectPath}</dd>
              <dt>{t.exportScreen.locales}</dt>
              <dd>{unity.locales.length === 0 ? t.exportScreen.none : unity.locales.map((locale) => locale.code).join(', ')}</dd>
              <dt>{t.exportScreen.collection}</dt>
              <dd>
                {unity.collections.length > 1 ? (
                  <select
                    value={unity.tableCollection ?? ''}
                    disabled={busy}
                    onChange={(event) =>
                      void projectAction(() => api.export.selectCollection(event.target.value), t.exportScreen.collectionPicked)
                    }
                  >
                    <option value="">{t.exportScreen.choose}</option>
                    {unity.collections.map((collection) => (
                      <option key={collection.name} value={collection.name}>
                        {t.exportScreen.collectionOption(collection.name, collection.entries)}
                      </option>
                    ))}
                  </select>
                ) : (
                  (unity.tableCollection ?? t.exportScreen.none)
                )}
              </dd>
              <dt>{t.exportScreen.keyIds}</dt>
              <dd>{t.exportScreen.idSummary(unity.idFound, unity.newKeys, unity.unityOnlyKeys)}</dd>
            </dl>
            {unity.unityOnlyKeys > 0 ? (
              <p className="hint field-error">{t.exportScreen.unityOnlyWarning(unity.unityOnlyKeys)}</p>
            ) : null}
            {unity.notices.map((notice) => (
              <p key={notice} className="hint">
                {notice}
              </p>
            ))}
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" disabled={busy} onClick={() => void reloadUnity()}>
                {t.exportScreen.reload}
              </button>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.linkUnity, t.exportScreen.linked)}>
                {t.exportScreen.otherFolder}
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => void projectAction(api.export.unlinkUnity, t.exportScreen.unlinked)}>
                {t.exportScreen.unlink}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h3>{t.exportScreen.template}</h3>
        {template === null || template.state === 'none' ? (
          <>
            <p className="hint">{t.exportScreen.templateHint}</p>
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.setTemplate, t.exportScreen.templateRegistered)}>
                {t.exportScreen.registerTemplate}
              </button>
            </div>
          </>
        ) : template.state === 'failed' ? (
          <>
            <div className="message error" style={{ marginTop: 0 }}>
              <strong>{t.exportScreen.templateFailed}</strong>
              {t.exportScreen.templateFallback}
              <pre>
                {template.path}: {template.reason}
              </pre>
            </div>
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.setTemplate, t.exportScreen.templateRegistered)}>
                {t.exportScreen.reregister}
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => void projectAction(api.export.clearTemplate, t.exportScreen.templateCleared)}>
                {t.exportScreen.unregister}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              <code>{template.path}</code>
              {t.exportScreen.templateColumns(template.header.length)}
            </p>
            <table className="locale-table template-table">
              <thead>
                <tr>
                  <th>{t.exportScreen.templateColumn}</th>
                  <th>{t.exportScreen.roleHeader}</th>
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
                            {t.exportScreen.role[role]}
                          </option>
                        ))}
                        {allLanguages.map((language) => (
                          <option key={`value:${language}`} value={`value:${language}`}>
                            {t.exportScreen.roleValue(language)}
                          </option>
                        ))}
                        {allLanguages.map((language) => (
                          <option key={`comments:${language}`} value={`comments:${language}`}>
                            {t.exportScreen.roleComments(language)}
                          </option>
                        ))}
                        <option value="omit:">{t.exportScreen.role.omit}</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" className="primary" disabled={busy || !mappingDirty} onClick={() => void saveMapping(mapping)}>
                {t.exportScreen.saveMapping}
              </button>
              <button type="button" disabled={busy || mappingDraft === null} onClick={() => setMappingDraft(null)}>
                {t.exportScreen.revert}
              </button>
              <button type="button" disabled={busy} onClick={() => void projectAction(api.export.setTemplate, t.exportScreen.templateReregistered)}>
                {t.exportScreen.reregister}
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => void projectAction(api.export.clearTemplate, t.exportScreen.templateCleared)}>
                {t.exportScreen.unregister}
              </button>
            </div>
          </>
        )}
      </section>

      {preview ? (
        <>
          <section className="card wide">
            <h3>
              {t.exportScreen.headerPreview}{' '}
              <span className="hint">
                · {preview.headerSource === 'template' ? t.exportScreen.origin.template : t.exportScreen.autoGenerated}
              </span>
            </h3>
            <div className="header-chips">
              {preview.columns.map((column, index) => (
                <span key={`${index}:${column.name}`} className="chip header-chip">
                  <code>{column.name}</code>
                  <span className="header-chip-origin">{t.exportScreen.origin[column.origin]}</span>
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
                    <th>{t.localeTable.language}</th>
                    <th>{t.localeTable.localeCode}</th>
                    <th>{t.localeTable.columnName}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.languages.map((language) => (
                    <tr key={language.language}>
                      <td>
                        <code>{language.language}</code>
                        {language.isSource ? <span className="hint"> {t.localeTable.source}</span> : null}
                      </td>
                      <td>
                        <code>{language.unityLocaleCode}</code>
                        <span className="hint">
                          {' '}
                          {language.codeOrigin === 'setting'
                            ? t.exportScreen.codeOrigin.setting
                            : language.codeOrigin === 'unity'
                              ? t.exportScreen.codeOrigin.unity
                              : t.exportScreen.codeOrigin.project}
                        </span>
                      </td>
                      <td>
                        <code>{language.columnName}</code>
                        <span className="hint">
                          {' '}
                          {language.nameOrigin === 'setting' ? t.exportScreen.nameOrigin.setting : t.exportScreen.nameOrigin.auto}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <div className="row" style={{ marginTop: 'var(--space-2)' }}>
              <button type="button" className="ghost" onClick={onOpenProjectSettings}>
                {t.exportScreen.editCodes}
              </button>
            </div>
            <p className="hint">{t.exportScreen.columnIgnored}</p>
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
              <p className="hint">{t.exportScreen.qaClean(preview.qaWarnings)}</p>
            ) : (
              <>
                <p className="hint field-error">{t.exportScreen.qaBlocked(preview.qaWarnings)}</p>
                <ul className="export-qa-list">
                  {preview.qaErrors.map((item, index) => (
                    <li key={`${item.language}:${item.key}:${item.ruleId}:${index}`} className="export-qa-item">
                      <span className="badge error">{item.language}</span>
                      <code className="token-key">{item.key}</code>
                      <span className="diagnostic-message">
                        <span className="diagnostic-rule">{t.qaRule[item.ruleId]}</span> {item.message}
                      </span>
                      <button type="button" className="ghost" onClick={() => onOpenReview({ language: item.language, key: item.key })}>
                        {t.exportScreen.openInReview}
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
            <h3>{t.exportScreen.smartTitle(preview.smart.length)}</h3>
            <p className="hint">{t.exportScreen.smartHint}</p>
            {preview.smartUnset > 0 ? (
              <p className="hint export-warning">{t.exportScreen.smartUnset(preview.smartUnset)}</p>
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
            <h3>{t.exportScreen.summary}</h3>
            <dl className="dl">
              <dt>{t.exportScreen.rowsToExport}</dt>
              <dd>
                {preview.summary.rows}
                {preview.summary.skippedRows > 0
                  ? t.exportScreen.skippedRows(
                      preview.summary.skippedRows,
                      `${preview.summary.skippedKeys.join(', ')}${preview.summary.skippedRows > preview.summary.skippedKeys.length ? ' …' : ''}`
                    )
                  : ''}
              </dd>
              {preview.summary.languages.map((language) => (
                <div key={language.language} style={{ display: 'contents' }}>
                  <dt>{language.language}</dt>
                  <dd>
                    {t.exportScreen.filled(language.filled, language.blank)}
                    {language.sourceFilled > 0 ? t.exportScreen.sourceFilled(language.sourceFilled) : ''}
                  </dd>
                </div>
              ))}
              <dt>{t.exportScreen.output}</dt>
              <dd>
                {preview.files.map((file) => (
                  <div key={file.name}>
                    {preview.outputDir}/{file.name}
                    {file.exists ? <span className="hint">{t.exportScreen.overwrites}</span> : null}
                  </div>
                ))}
              </dd>
            </dl>
            <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
              {t.exportScreen.importBefore}
              <strong>CSV(Merge)...</strong>
              {t.exportScreen.importMiddle}
              <strong>CSV...</strong>
              {t.exportScreen.importAfter}
            </p>
          </section>
        </>
      ) : loading ? (
        <p className="hint">{t.exportScreen.calculating}</p>
      ) : null}

      {confirmFiles !== null ? (
        <ConfirmDialog
          title={t.exportScreen.overwriteTitle}
          confirmLabel={t.exportScreen.overwrite}
          danger
          onCancel={() => setConfirmFiles(null)}
          onConfirm={() => void runExport(true)}
        >
          <p>{t.exportScreen.overwriteBody(preview?.outputDir ?? 'export')}</p>
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
