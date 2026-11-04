import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { GlossaryEntry } from '@shared/schema/glossary'
import { useT } from '../i18n'
import { useColumnSizing } from '../state/column-sizing'

const ROW_HEIGHT = 34
const HEADER_HEIGHT = 30
const SIZING_KEY = 'babel.glossaryGrid.columnSizing'

/** 그리드 한 줄. base 는 파일에서 읽은 값, entry 는 사람이 고친 뒤의 값이다. */
export type GlossaryGridRow = {
  /** 파일에서 읽은 용어의 정체(대소문자 무시). 이름을 고쳐도 저장하기 전까지는 그대로다 */
  id: string
  base: GlossaryEntry
  entry: GlossaryEntry
  dirty: boolean
  selected: boolean
  low: boolean
  /** 용어가 비었거나 다른 용어와 겹치면 */
  problem: string | null
}

export type EditEntry = (id: string, change: (entry: GlossaryEntry) => GlossaryEntry) => void

type Props = {
  rows: GlossaryGridRow[]
  languages: readonly string[]
  disabled: boolean
  /** 이 행이 보이도록 스크롤한다(방금 추가한 용어) */
  focusId: string | null
  onToggle: (id: string) => void
  onEdit: EditEntry
}

const helper = createColumnHelper<GlossaryGridRow>()

function TextCell({
  value,
  mono = false,
  invalid = false,
  pending = false,
  title,
  disabled,
  placeholder,
  onChange
}: {
  value: string
  mono?: boolean
  invalid?: boolean
  /** 승인 대기 언어의 번역(용어 번역이 채운 칸) */
  pending?: boolean
  title?: string
  disabled: boolean
  placeholder?: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const classes = ['grid-input']
  if (mono) classes.push('mono')
  if (invalid) classes.push('invalid')
  if (pending) classes.push('pending')
  return (
    <textarea
      rows={1}
      className={classes.join(' ')}
      value={value}
      title={title}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/** 승인된 용어에서 승인을 기다리는 언어 중 화면에 보이는 것 */
function waitingLanguages(entry: GlossaryEntry, languages: readonly string[]): string[] {
  return entry.status === 'approved' ? entry.pendingLanguages.filter((language) => languages.includes(language)) : []
}

export function GlossaryGrid({ rows, languages, disabled, focusId, onToggle, onEdit }: Props): React.JSX.Element {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [columnSizing, setColumnSizing] = useColumnSizing(SIZING_KEY)

  const columns = useMemo(
    () => [
      helper.display({
        id: 'select',
        header: '',
        size: 32,
        minSize: 32,
        maxSize: 32,
        enableResizing: false,
        cell: (info) => (
          <input
            type="checkbox"
            className="cell-check"
            checked={info.row.original.selected}
            onChange={() => onToggle(info.row.original.id)}
            aria-label={t.grid.select(info.row.original.base.term)}
          />
        )
      }),
      helper.display({
        id: 'status',
        header: t.grid.status,
        size: 76,
        cell: (info) => {
          const { entry } = info.row.original
          if (entry.status === 'pending') {
            return (
              <span className="status-badge review" title={t.glossaryGrid.candidateHint}>
                {t.glossaryGrid.pending}
              </span>
            )
          }
          const waiting = waitingLanguages(entry, languages)
          if (waiting.length > 0) {
            return (
              <span className="status-badge review" title={t.glossaryGrid.partialHint(waiting.join(', '))}>
                {t.glossaryGrid.partial}
              </span>
            )
          }
          return <span className="status-badge approved">{t.glossaryGrid.approved}</span>
        }
      }),
      helper.display({
        id: 'term',
        header: t.glossaryGrid.term,
        size: 150,
        cell: (info) => {
          const row = info.row.original
          return (
            <div className="cell-stack">
              <TextCell
                value={row.entry.term}
                invalid={row.problem !== null}
                disabled={disabled}
                onChange={(value) => onEdit(row.id, (entry) => ({ ...entry, term: value }))}
              />
              {row.problem ? <span className="hint field-error">{row.problem}</span> : null}
            </div>
          )
        }
      }),
      ...languages.map((language) =>
        helper.display({
          id: `translation_${language}`,
          header: t.grid.translationIn(language),
          size: 160,
          cell: (info) => {
            const row = info.row.original
            const waiting = waitingLanguages(row.entry, languages).includes(language)
            return (
              <TextCell
                value={row.entry.translations[language] ?? ''}
                pending={waiting}
                title={waiting ? t.glossaryGrid.waitingCell : undefined}
                disabled={disabled}
                placeholder={t.glossaryGrid.fixedTranslation}
                onChange={(value) =>
                  onEdit(row.id, (entry) => ({ ...entry, translations: { ...entry.translations, [language]: value } }))
                }
              />
            )
          }
        })
      ),
      helper.display({
        id: 'pos',
        header: t.glossaryGrid.pos,
        size: 90,
        cell: (info) => {
          const row = info.row.original
          return <TextCell value={row.entry.pos} disabled={disabled} onChange={(value) => onEdit(row.id, (entry) => ({ ...entry, pos: value }))} />
        }
      }),
      helper.display({
        id: 'note',
        header: () => <span title={t.glossaryGrid.noteHint}>{t.glossaryGrid.note}</span>,
        size: 200,
        cell: (info) => {
          const row = info.row.original
          return (
            <TextCell
              value={row.entry.note}
              disabled={disabled}
              onChange={(value) => onEdit(row.id, (entry) => ({ ...entry, note: value }))}
            />
          )
        }
      }),
      helper.display({
        id: 'strict',
        header: 'strict',
        size: 56,
        enableResizing: false,
        cell: (info) => {
          const row = info.row.original
          return (
            <input
              type="checkbox"
              className="cell-check"
              checked={row.entry.strict}
              disabled={disabled}
              title={t.glossaryGrid.strictHint}
              onChange={(event) => {
                const strict = event.target.checked
                onEdit(row.id, (entry) => ({ ...entry, strict }))
              }}
            />
          )
        }
      }),
      helper.display({
        id: 'reason',
        header: t.glossaryGrid.reason,
        size: 200,
        cell: (info) => {
          const { entry, low } = info.row.original
          if (!entry.reason && !entry.confidence) return <span className="grid-text muted">—</span>
          return (
            <span className="grid-text">
              {entry.confidence ? <span className={low ? 'mono confidence low' : 'mono confidence'}>{entry.confidence} </span> : null}
              {entry.reason}
            </span>
          )
        }
      })
    ],
    [disabled, languages, onEdit, onToggle, t]
  )

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: { minSize: 50, maxSize: 900 },
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing
  })
  const modelRows = table.getRowModel().rows

  const getItemKey = useCallback((index: number) => rows[index]?.id ?? index, [rows])
  const virtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    getItemKey,
    scrollMargin: HEADER_HEIGHT,
    scrollPaddingStart: HEADER_HEIGHT
  })

  // 새 focusId 마다 한 번만 스크롤한다 — 그 뒤 필터를 바꿔 행 위치가 달라져도 다시 끌고 가지 않게
  const focusIndex = focusId === null ? -1 : rows.findIndex((row) => row.id === focusId)
  const focusedRef = useRef<string | null>(null)
  useEffect(() => {
    if (focusId === null || focusId === focusedRef.current || focusIndex < 0) return
    focusedRef.current = focusId
    virtualizer.scrollToIndex(focusIndex, { align: 'center' })
  }, [focusId, focusIndex, virtualizer])

  const columnSizes = table.getVisibleLeafColumns().map((column) => column.getSize())
  const template = columnSizes.map((size) => `${size}px`).join(' ')
  const totalWidth = `${columnSizes.reduce((sum, size) => sum + size, 0)}px`
  const resizing = table.getState().columnSizingInfo.isResizingColumn !== false

  return (
    <div className={resizing ? 'grid-wrap resizing' : 'grid-wrap'}>
      <div className="grid-body" ref={scrollRef}>
        <div className="grid-head" style={{ gridTemplateColumns: template, width: totalWidth, height: HEADER_HEIGHT }}>
          {table.getHeaderGroups()[0]?.headers.map((header) => (
            <div key={header.id} className="grid-cell grid-header-cell">
              {flexRender(header.column.columnDef.header, header.getContext())}
              {header.column.getCanResize() ? (
                <div
                  className={header.column.getIsResizing() ? 'col-resizer active' : 'col-resizer'}
                  title={t.common.resizeColumn}
                  onMouseDown={header.getResizeHandler()}
                  onTouchStart={header.getResizeHandler()}
                  onDoubleClick={() => header.column.resetSize()}
                />
              ) : null}
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="grid-empty">{t.glossaryGrid.empty}</div>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, width: totalWidth, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = modelRows[item.index]
              if (!row) return null
              const classes = ['grid-row']
              if (row.original.selected) classes.push('selected')
              if (row.original.dirty) classes.push('edited')
              return (
                <div
                  key={row.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className={classes.join(' ')}
                  style={{
                    gridTemplateColumns: template,
                    transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div key={cell.id} className="grid-cell">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
