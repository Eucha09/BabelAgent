import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildLanguageOptions,
  customLanguageCode,
  englishLanguageName,
  filterLanguageOptions,
  koreanLanguageName,
  type LanguageOption
} from '@core/project/languages'
import { isLanguageTag } from '@core/project/settings'
import type { UiLanguage } from '@shared/i18n'
import { useI18n } from '../i18n'

/** 언어 이름은 화면 언어로 보여 준다. 찾기는 두 이름 모두로 된다 */
function nameIn(code: string, language: UiLanguage): string {
  return language === 'ko' ? koreanLanguageName(code) : englishLanguageName(code)
}

/** 고를 수 있는 언어 목록. 한 번만 만든다. */
const OPTIONS: readonly LanguageOption[] = buildLanguageOptions()

type MenuItem = { code: string; name: string; englishName: string; custom: boolean; divider: boolean }

type MenuProps = {
  /** 이 안을 누르면 닫지 않는다(여닫는 버튼 포함) */
  boundaryRef: React.RefObject<HTMLDivElement | null>
  /** 목록에서 뺄 코드(이미 고른 언어, 원문/대상 언어) */
  exclude: ReadonlySet<string>
  onPick: (code: string) => void
  onClose: () => void
}

/**
 * 언어를 찾아 고르는 목록. 이름(한국어·영어)이나 코드로 찾고, ↑↓·Enter·Esc 로 다룬다.
 * 목록에 없는 코드는 BCP 47 태그일 때만 "직접 추가"로 넣을 수 있다.
 */
function LanguageMenu({ boundaryRef, exclude, onPick, onClose }: MenuProps): React.JSX.Element {
  const { language, t } = useI18n()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const activeRef = useRef<HTMLLIElement>(null)

  const items = useMemo((): MenuItem[] => {
    const found = filterLanguageOptions(OPTIONS, query, exclude)
    const custom = customLanguageCode(OPTIONS, query, exclude)
    const searching = query.trim() !== ''
    const list = found.map((item, index) => ({
      ...item,
      custom: false,
      // 검색어가 없을 때 자주 쓰는 언어와 나머지 사이에 선을 긋는다
      divider: !searching && index > 0 && !item.common && (found[index - 1]?.common ?? false)
    }))
    return custom
      ? [{ code: custom, name: koreanLanguageName(custom), englishName: '', custom: true, divider: false }, ...list]
      : list
  }, [query, exclude])

  // 효과 함수는 값을 돌려주면 안 된다 — 지금 Chromium 의 scrollIntoView 는 Promise 를 돌려주고, React 는 그것을 정리 함수로 부른다
  useEffect(() => {
    setActive(0)
  }, [query])
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // 바깥을 누르면 닫는다. 여닫는 버튼은 안쪽이라 버튼이 직접 닫는다
  useEffect(() => {
    const close = (event: MouseEvent): void => {
      if (event.target instanceof Node && boundaryRef.current?.contains(event.target)) return
      onClose()
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [boundaryRef, onClose])

  const pick = (item: MenuItem | undefined): void => {
    if (item) onPick(item.code)
  }

  return (
    <div className="language-menu">
      <input
        autoFocus
        value={query}
        placeholder={t.languagePicker.search}
        aria-label={t.languagePicker.searchLabel}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((index) => Math.min(index + 1, items.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            pick(items[active])
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
          }
        }}
      />
      <ul className="language-menu-list" role="listbox">
        {items.length === 0 ? <li className="language-menu-empty">{t.languagePicker.empty}</li> : null}
        {items.map((item, index) => (
          <li
            key={`${item.custom ? 'custom:' : ''}${item.code}`}
            ref={index === active ? activeRef : undefined}
            role="option"
            aria-selected={index === active}
            className={[
              'language-menu-item',
              index === active ? 'active' : '',
              item.divider ? 'divider' : ''
            ].join(' ')}
            onMouseEnter={() => setActive(index)}
            // 입력칸의 포커스를 잃기 전에 고른다
            onMouseDown={(event) => {
              event.preventDefault()
              pick(item)
            }}
          >
            <code>{item.code}</code>
            <span>
              {item.custom
                ? `${t.languagePicker.custom}${nameIn(item.code, language) ? ` · ${nameIn(item.code, language)}` : ''}`
                : language === 'ko'
                  ? item.name
                  : item.englishName}
            </span>
            {language === 'ko' && item.englishName ? <span className="language-menu-english">{item.englishName}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 코드와 화면 언어의 이름. 잘못된 코드는 오류 색 */
function LanguageLabel({ code }: { code: string }): React.JSX.Element {
  const { language } = useI18n()
  const name = nameIn(code, language)
  return (
    <>
      <code>{code}</code>
      {name ? <span>{name}</span> : null}
    </>
  )
}

type SelectProps = {
  id?: string
  value: string
  /** 고를 수 없는 코드(대상 언어) */
  exclude?: readonly string[]
  onChange: (code: string) => void
}

/** 언어 하나를 고른다(원문 언어). */
export function LanguageSelect({ id, value, exclude = [], onChange }: SelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const boundaryRef = useRef<HTMLDivElement>(null)
  const excluded = useMemo(() => new Set([value, ...exclude]), [value, exclude])
  const { t } = useI18n()
  const valid = value === '' || isLanguageTag(value)
  return (
    <div className="language-picker" ref={boundaryRef}>
      <button
        id={id}
        type="button"
        className={valid ? 'language-select' : 'language-select invalid'}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {value === '' ? <span className="language-placeholder">{t.languagePicker.choose}</span> : <LanguageLabel code={value} />}
        <span className="language-caret">▾</span>
      </button>
      {open ? (
        <LanguageMenu
          boundaryRef={boundaryRef}
          exclude={excluded}
          onClose={() => setOpen(false)}
          onPick={(code) => {
            onChange(code)
            setOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}

type MultiProps = {
  id?: string
  values: readonly string[]
  /** 고를 수 없는 코드(원문 언어) */
  exclude?: readonly string[]
  onChange: (codes: string[]) => void
}

/** 언어 여러 개를 고른다(대상 언어). 고른 순서를 지키고, 칩의 × 로 뺀다. */
export function LanguageMultiSelect({ id, values, exclude = [], onChange }: MultiProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const boundaryRef = useRef<HTMLDivElement>(null)
  const excluded = useMemo(() => new Set([...values, ...exclude]), [values, exclude])
  const { t } = useI18n()
  return (
    <div className="language-picker" ref={boundaryRef}>
      <div className="language-chips">
        {values.map((code) => (
          <span key={code} className={isLanguageTag(code) ? 'chip language-chip' : 'chip language-chip invalid'}>
            <LanguageLabel code={code} />
            <button
              type="button"
              className="chip-remove"
              title={t.languagePicker.remove(code)}
              aria-label={t.languagePicker.remove(code)}
              onClick={() => onChange(values.filter((item) => item !== code))}
            >
              ×
            </button>
          </span>
        ))}
        <button id={id} type="button" className="language-add" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((prev) => !prev)}>
          {t.languagePicker.add}
        </button>
      </div>
      {open ? (
        <LanguageMenu
          boundaryRef={boundaryRef}
          exclude={excluded}
          onClose={() => setOpen(false)}
          onPick={(code) => {
            onChange([...values, code])
            setOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
