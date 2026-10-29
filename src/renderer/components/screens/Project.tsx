import { useEffect, useMemo, useRef, useState } from 'react'
import { fromProjectForm, splitList, toProjectForm, type ProjectForm } from '@core/project/form'
import { MIN_SUGGESTED_MAX_LEN } from '@core/context/submission'
import { defaultColumnName } from '@core/export/locales'
import {
  buildSettingsPatch,
  isLanguageTag,
  MAX_LEN_RATIO_LIMIT,
  nextStyleRuleId,
  type SettingsField,
  type SettingsProblem
} from '@core/project/settings'
import { TranslateEffort, TranslateModel } from '@shared/schema/jobs'
import { MAX_CONCURRENCY, type OpenProject, type ProjectConfig, type ProjectSettingsPatch } from '@shared/schema/project'
import type { IpcError, IpcResult } from '@shared/types'
import { EFFORT_HINT, EFFORT_OPTIONS, MODEL_OPTIONS } from '../../state/translate-options'

type Props = {
  project: OpenProject
  /** 바뀐 묶음만 보낸다. 메인이 최신 project.json 에 합쳐 저장한 결과를 돌려준다. */
  onSave: (patch: ProjectSettingsPatch) => Promise<IpcResult<OpenProject>>
  /** 저장하지 않은 변경이 있는지. 다른 화면으로 갈 때 확인을 받는다. */
  onDirtyChange: (dirty: boolean) => void
  onMessage: (text: string) => void
}

const languageNames = new Intl.DisplayNames(['ko'], { type: 'language' })

/** 언어 코드 옆에 붙일 이름. 모르는 코드면 빈 글자. */
function languageName(code: string): string {
  if (!isLanguageTag(code)) return ''
  try {
    const name = languageNames.of(code)
    return name && name !== code ? name : ''
  } catch {
    return ''
  }
}

function FieldError({ problems, field }: { problems: readonly SettingsProblem[]; field: SettingsField }): React.JSX.Element | null {
  const found = problems.filter((problem) => problem.field === field)
  if (found.length === 0) return null
  return (
    <>
      {found.map((problem) => (
        <p key={problem.message} className="hint field-error">
          {problem.message}
        </p>
      ))}
    </>
  )
}

/** 언어 목록을 이름과 함께 보여 준다. 잘못된 코드는 오류 색으로. */
function LanguageChips({ codes }: { codes: readonly string[] }): React.JSX.Element | null {
  if (codes.length === 0) return null
  return (
    <div className="language-chips">
      {codes.map((code) => {
        const name = languageName(code)
        return (
          <span key={code} className={isLanguageTag(code) ? 'chip' : 'chip invalid'}>
            <code>{code}</code>
            {name ? <span>{name}</span> : null}
          </span>
        )
      })}
    </div>
  )
}

/**
 * 프로젝트 설정(project.json). 여러 칸을 고친 뒤 한 번에 저장한다.
 * 저장할 때는 화면을 연 시점과 달라진 묶음만 보내므로, 그 사이 앱 밖에서 고친 다른 묶음은 지워지지 않는다.
 */
export function Project({ project, onSave, onDirtyChange, onMessage }: Props): React.JSX.Element {
  const { config } = project
  /** 화면을 연(또는 마지막으로 저장한) 시점의 설정. 바뀐 묶음을 가리는 기준이다. */
  const [base, setBase] = useState<ProjectConfig>(config)
  const [form, setForm] = useState<ProjectForm>(() => toProjectForm(config))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<IpcError | null>(null)
  const [externalChange, setExternalChange] = useState(false)

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(toProjectForm(base)), [form, base])
  const { config: draft, problems } = useMemo(() => fromProjectForm(form, base), [form, base])

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  // project.json 이 밖에서 바뀌었을 때: 편집 중이 아니면 새 값으로 다시 채우고, 편집 중이면 알리기만 한다
  useEffect(() => {
    if (dirtyRef.current) {
      setExternalChange(true)
      return
    }
    setBase(config)
    setForm(toProjectForm(config))
    setExternalChange(false)
  }, [config])

  const update = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const save = async (): Promise<void> => {
    if (problems.length > 0) return
    const patch = buildSettingsPatch(base, draft)
    if (Object.keys(patch).length === 0) return
    setSaving(true)
    try {
      const result = await onSave(patch)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setExternalChange(false)
      setBase(result.value.config)
      setForm(toProjectForm(result.value.config))
      onMessage('프로젝트 설정을 저장했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const discard = (): void => {
    setForm(toProjectForm(base))
    setError(null)
  }

  const targetCodes = splitList(form.targetLanguages)
  const removedTargets = base.targetLanguages.filter((code) => !targetCodes.includes(code))
  // 내보내기 카드는 원문 + 대상 언어마다 한 줄
  const exportLanguages = [...new Set([form.sourceLanguage.trim(), ...targetCodes])].filter((code) => isLanguageTag(code))

  const updateLocale = (language: string, field: 'unityLocaleCode' | 'columnName', value: string): void => {
    const current = form.exportLocales[language] ?? { unityLocaleCode: '', columnName: '' }
    const next = { ...current, [field]: value }
    const locales = { ...form.exportLocales }
    // 두 칸이 다 비면 자동과 같으므로 항목을 지운다(저장할 때 바뀐 것으로 보지 않게)
    if (next.unityLocaleCode === '' && next.columnName === '') delete locales[language]
    else locales[language] = next
    update('exportLocales', locales)
  }

  return (
    <div className="project-screen">
      <div className="strings-header project-header">
        <div>
          <h2 className="screen-title">프로젝트</h2>
          <p className="screen-desc">
            project.json 에 저장되는 설정입니다. 게임 소개·톤 가이드·스타일 규칙은 번역 프롬프트의 고정 부분에 그대로
            들어가고, 저장하면 다음 번역 작업부터 반영됩니다.
          </p>
        </div>
        <div className="row">
          <button type="button" disabled={saving || !dirty} onClick={discard}>
            변경 취소
          </button>
          <button
            type="button"
            className="primary"
            disabled={saving || !dirty || problems.length > 0}
            title={problems.length > 0 ? '빨간 글씨로 표시한 칸을 먼저 고치세요' : undefined}
            onClick={() => void save()}
          >
            저장{dirty ? ' *' : ''}
          </button>
        </div>
      </div>

      {externalChange ? (
        <div className="message">
          project.json 이 앱 밖에서 바뀌었습니다. 저장하면 이 화면에서 고친 묶음만 덮어쓰고, 밖에서 고친 다른 묶음은
          그대로 남습니다. [변경 취소]를 누르면 바뀐 내용으로 다시 채웁니다.
        </div>
      ) : null}
      {error ? (
        <div className="message error">
          <strong>{error.message}</strong>
          {error.detail ? <pre>{error.detail}</pre> : null}
        </div>
      ) : null}

      <section className="card">
        <h3>기본 정보</h3>
        <div className="field">
          <label htmlFor="project-name">프로젝트 이름</label>
          <input id="project-name" value={form.name} onChange={(event) => update('name', event.target.value)} />
          <FieldError problems={problems} field="name" />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="source-language">원문 언어 코드</label>
            <input
              id="source-language"
              className="mono"
              value={form.sourceLanguage}
              onChange={(event) => update('sourceLanguage', event.target.value)}
              placeholder="ko"
            />
            <LanguageChips codes={[form.sourceLanguage.trim()].filter((code) => code !== '')} />
            <FieldError problems={problems} field="sourceLanguage" />
            {form.sourceLanguage.trim() !== base.sourceLanguage ? (
              <p className="hint">
                원문 언어는 번역 프롬프트, 에이전트 메모 언어, 용어집 매칭 방식에 쓰입니다. 원문 파일 내용은 바뀌지
                않습니다.
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="target-languages">대상 언어 코드 (쉼표로 구분)</label>
            <input
              id="target-languages"
              className="mono"
              value={form.targetLanguages}
              onChange={(event) => update('targetLanguages', event.target.value)}
              placeholder="en, ja"
            />
            <LanguageChips codes={targetCodes} />
            <FieldError problems={problems} field="targetLanguages" />
            {removedTargets.length > 0 ? (
              <p className="hint">
                목록에서 빼도 {removedTargets.map((code) => `translations_${code}.csv`).join(', ')} 파일은 지우지
                않습니다. 다시 넣으면 그대로 이어서 씁니다.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card">
        <h3>게임</h3>
        <div className="field">
          <label htmlFor="game-genre">장르</label>
          <input
            id="game-genre"
            value={form.genre}
            onChange={(event) => update('genre', event.target.value)}
            placeholder="예: 판타지 RPG"
          />
        </div>
        <div className="field">
          <label htmlFor="game-intro">게임 소개</label>
          <textarea
            id="game-intro"
            rows={5}
            value={form.intro}
            onChange={(event) => update('intro', event.target.value)}
            placeholder="세계관, 주요 인물, 플레이어가 하는 일 등. 번역가가 알아야 할 배경을 적습니다."
          />
        </div>
        <div className="field">
          <label htmlFor="game-tone">톤 가이드</label>
          <textarea
            id="game-tone"
            rows={4}
            value={form.toneGuide}
            onChange={(event) => update('toneGuide', event.target.value)}
            placeholder="예: 간결하고 경쾌하게. UI 는 명사형으로 짧게, NPC 대사는 캐릭터 말투를 살린다."
          />
        </div>
      </section>

      <section className="card">
        <h3>스타일 규칙</h3>
        <p className="hint" style={{ marginBottom: 'var(--space-3)' }}>
          모든 번역 배치에 들어가는 지속 지시입니다. 한 줄에 규칙 하나를 적습니다.
        </p>
        {form.styleRules.length === 0 ? <p className="hint">아직 규칙이 없습니다.</p> : null}
        <ol className="style-rules">
          {form.styleRules.map((rule, index) => (
            <li key={rule.id} className="style-rule">
              <span className="style-rule-index mono">{index + 1}</span>
              <textarea
                rows={1}
                value={rule.text}
                placeholder="예: NPC 대사는 반말로"
                onChange={(event) =>
                  update(
                    'styleRules',
                    form.styleRules.map((item, at) => (at === index ? { ...item, text: event.target.value } : item))
                  )
                }
              />
              <button
                type="button"
                className="ghost"
                title="이 규칙 삭제"
                onClick={() =>
                  update(
                    'styleRules',
                    form.styleRules.filter((_item, at) => at !== index)
                  )
                }
              >
                삭제
              </button>
            </li>
          ))}
        </ol>
        <FieldError problems={problems} field="styleRules" />
        <button
          type="button"
          onClick={() =>
            update('styleRules', [
              ...form.styleRules,
              { id: nextStyleRuleId(form.styleRules), text: '', createdAt: new Date().toISOString() }
            ])
          }
        >
          규칙 추가
        </button>
      </section>

      <section className="card">
        <h3>번역</h3>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">모델</span>
            <select
              value={form.model}
              onChange={(event) => {
                const next = TranslateModel.safeParse(event.target.value)
                if (next.success) update('model', next.data)
              }}
            >
              {MODEL_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" title={EFFORT_HINT}>
            <span className="field-label">사고 수준</span>
            <select
              value={form.effort}
              onChange={(event) => {
                const next = TranslateEffort.safeParse(event.target.value)
                if (next.success) update('effort', next.data)
              }}
            >
              {EFFORT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid three">
          <div className="field">
            <label htmlFor="batch-rows">배치 최대 행 수</label>
            <input
              id="batch-rows"
              type="number"
              min={1}
              step={1}
              value={form.maxRows}
              onChange={(event) => update('maxRows', event.target.value)}
            />
            <FieldError problems={problems} field="batch.maxRows" />
          </div>
          <div className="field">
            <label htmlFor="batch-chars">배치 최대 원문 글자 수</label>
            <input
              id="batch-chars"
              type="number"
              min={1}
              step={100}
              value={form.maxSourceChars}
              onChange={(event) => update('maxSourceChars', event.target.value)}
            />
            <FieldError problems={problems} field="batch.maxSourceChars" />
          </div>
          <div className="field">
            <label htmlFor="batch-workers">동시 작업자 (1~{MAX_CONCURRENCY})</label>
            <input
              id="batch-workers"
              type="number"
              min={1}
              max={MAX_CONCURRENCY}
              step={1}
              value={form.concurrency}
              onChange={(event) => update('concurrency', event.target.value)}
            />
            <FieldError problems={problems} field="batch.concurrency" />
          </div>
        </div>
        <p className="hint">
          배치는 행 수와 원문 글자 수 중 먼저 닿는 쪽에서 끊습니다. 배치가 클수록 세션 수는 줄지만 한 번 실패할 때 다시
          돌릴 양이 늘어납니다. {EFFORT_HINT}
        </p>
      </section>

      <section className="card">
        <h3>검토</h3>
        <div className="field">
          <label htmlFor="low-confidence">신뢰도 낮음 기준 (0~1)</label>
          <input
            id="low-confidence"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={form.lowConfidence}
            onChange={(event) => update('lowConfidence', event.target.value)}
            style={{ maxWidth: 160 }}
          />
          <FieldError problems={problems} field="review.lowConfidence" />
          <p className="hint">
            에이전트 신뢰도가 이 값보다 낮은 행을 검토 화면의 "신뢰도 낮음" 필터로 모으고, 초안 일괄 승인에서 뺍니다.
          </p>
        </div>
      </section>

      <section className="card">
        <h3>컨텍스트 추정</h3>
        <div className="field">
          <label htmlFor="max-len-ratio">최대 길이 여유 배수 (1~{MAX_LEN_RATIO_LIMIT})</label>
          <input
            id="max-len-ratio"
            type="number"
            min={1}
            max={MAX_LEN_RATIO_LIMIT}
            step={0.1}
            value={form.maxLenRatio}
            onChange={(event) => update('maxLenRatio', event.target.value)}
            style={{ maxWidth: 160 }}
          />
          <FieldError problems={problems} field="context.maxLenRatio" />
          <p className="hint">
            에이전트가 제안하는 최대 길이는 원문 길이 × 이 배수(최소 {MIN_SUGGESTED_MAX_LEN}자) 아래로 내려가지 않습니다. 최대 길이는
            번역문의 한도라서, 원문보다 번역이 길어지는 언어 조합이면 값을 키우세요.
          </p>
        </div>
      </section>

      <section className="card" id="project-export-card">
        <h3>내보내기</h3>
        <p className="hint" style={{ marginBottom: 'var(--space-3)' }}>
          Unity CSV 의 언어 열입니다. 열 이름이 Unity 쪽과 한 글자라도 다르면 Unity 가 그 열을 조용히 무시합니다. 빈 칸은
          자동입니다 — 로케일 코드는 프로젝트 언어 코드(Unity 프로젝트를 연결했으면 그 프로젝트의 로케일), 열 이름은{' '}
          <code>{'{영어 언어명}({코드})'}</code>입니다.
        </p>
        <table className="locale-table">
          <thead>
            <tr>
              <th>언어</th>
              <th>Unity 로케일 코드</th>
              <th>열 이름</th>
            </tr>
          </thead>
          <tbody>
            {exportLanguages.map((language) => {
              const locale = form.exportLocales[language] ?? { unityLocaleCode: '', columnName: '' }
              const code = locale.unityLocaleCode.trim() || language
              return (
                <tr key={language}>
                  <td>
                    <code>{language}</code>
                    {language === form.sourceLanguage.trim() ? <span className="hint"> 원문</span> : null}
                  </td>
                  <td>
                    <input
                      className="mono"
                      value={locale.unityLocaleCode}
                      placeholder={language}
                      aria-label={`${language} Unity 로케일 코드`}
                      onChange={(event) => updateLocale(language, 'unityLocaleCode', event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="mono"
                      value={locale.columnName}
                      placeholder={defaultColumnName(code)}
                      aria-label={`${language} 열 이름`}
                      onChange={(event) => updateLocale(language, 'columnName', event.target.value)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <FieldError problems={problems} field="export.locales" />
        <p className="hint">
          만들어질 헤더 전체와 Unity 연결·템플릿·옵션은 <strong>내보내기</strong> 화면에서 봅니다. 처음 한 번은 Unity 에서
          내보낸 CSV 의 첫 줄과 눈으로 비교해 보세요.
        </p>
      </section>

      <section className="card">
        <details>
          <summary>
            <h3 className="summary-title">고급: Smart Strings</h3>
          </summary>
          <p className="hint" style={{ marginBottom: 'var(--space-3)' }}>
            Unity 프로젝트의 SmartFormat 설정과 같게 맞추세요. QA 의 중괄호·변수·포매터 검사가 이 값을 따릅니다.
          </p>
          <div className="check-list">
            <label className="check">
              <input type="checkbox" checked={form.smartEnabled} onChange={(event) => update('smartEnabled', event.target.checked)} />
              <span>Smart Strings 사용 (끄면 포매터 이름 경고만 끕니다)</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.alternativeEscaping}
                onChange={(event) => update('alternativeEscaping', event.target.checked)}
              />
              <span>대체 이스케이프 (alternativeEscaping) — 켜면 이스케이프 문자 + 중괄호가 리터럴, 끄면 {'{{ }}'}</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.convertCharacterStringLiterals}
                onChange={(event) => update('convertCharacterStringLiterals', event.target.checked)}
              />
              <span>문자 리터럴 변환 (convertCharacterStringLiterals) — \n, \t 를 문자로</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={form.caseSensitive} onChange={(event) => update('caseSensitive', event.target.checked)} />
              <span>대소문자 구분 (caseSensitive) — 변수·포매터 이름 비교</span>
            </label>
          </div>
          <div className="field">
            <label htmlFor="escape-char">이스케이프 문자 (escapeChar)</label>
            <input
              id="escape-char"
              className="mono"
              value={form.escapeChar}
              onChange={(event) => update('escapeChar', event.target.value)}
              style={{ maxWidth: 80 }}
            />
            <FieldError problems={problems} field="smartStrings.escapeChar" />
          </div>
          <div className="field">
            <label htmlFor="formatters">포매터 목록 (쉼표로 구분)</label>
            <textarea
              id="formatters"
              className="mono"
              rows={3}
              value={form.formatters}
              onChange={(event) => update('formatters', event.target.value)}
            />
            <FieldError problems={problems} field="smartStrings.formatters" />
            <p className="hint">목록에 없는 포매터 이름은 경고로 표시합니다. 커스텀 포매터를 등록했다면 여기에 더하세요.</p>
          </div>
        </details>
      </section>
    </div>
  )
}
