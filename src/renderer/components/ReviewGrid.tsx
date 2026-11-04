import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { parseConfidence } from '@core/review/filter'
import type { SmartSyntax } from '@core/qa/smart'
import type { QaDiagnostic } from '@shared/schema/qa'
import type { StringsRow } from '@shared/schema/strings'
import { useT } from '../i18n'
import { useColumnSizing } from '../state/column-sizing'
import { statusLabel } from '../state/labels'
import { TokenText } from './TokenText'

const ROW_HEIGHT = 34
const HEADER_HEIGHT = 30
const SIZING_KEY = 'babel.reviewGrid.columnSizing'

export type ReviewRow = StringsRow & { diagnostics: readonly QaDiagnostic[] }

export type EditingCell = { key: string; text: string }

type GridState = {
  syntax: SmartSyntax
  lowConfidence: number
  editing: EditingCell | null
  disabled: boolean
  onStartEdit: (key: string) => void
  onEditChange: (text: string) => void
  /** 편집을 끝낸다. 키보드로 끝냈으면 그리드로 포커스를 돌려 화살표 이동을 잇는다. */
  onCommitEdit: (refocus: boolean) => void
  onCancelEdit: () => void
}

/**
 * 칸 렌더러는 열 정의 안에 있어 정체가 바뀌면 다시 마운트된다(편집 중 포커스가 날아간다).
 * 그래서 열 정의는 고정하고, 편집 상태처럼 자주 바뀌는 값은 컨텍스트로 칸에 건넨다.
 */
const GridStateContext = createContext<GridState | null>(null)

function useGridState(): GridState {
  const state = useContext(GridStateContext)
  if (!state) throw new Error('ReviewGrid cell rendered outside the grid')
  return state
}

function SourceCell({ text }: { text: string }): React.JSX.Element {
  const { syntax } = useGridState()
  return <TokenText className="grid-text" text={text} syntax={syntax} />
}

function TranslationCell({ row }: { row: ReviewRow }): React.JSX.Element {
  const t = useT()
  const { syntax, editing, disabled, onStartEdit, onEditChange, onCommitEdit, onCancelEdit } = useGridState()

  if (editing?.key === row.key) {
    return (
      <textarea
        rows={1}
        className="grid-input editing"
        value={editing.text}
        autoFocus
        onFocus={(event) => {
          const end = event.currentTarget.value.length
          event.currentTarget.setSelectionRange(end, end)
        }}
        onChange={(event) => onEditChange(event.target.value)}
        onBlur={() => onCommitEdit(false)}
        onKeyDown={(event) => {
          // 그리드의 화살표 이동이 편집 중 키를 가로채지 않게 한다
          event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancelEdit()
          } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            onCommitEdit(true)
          }
        }}
      />
    )
  }

  return (
    <span
      className="grid-text translation-cell"
      title={disabled ? undefined : t.grid.editHint}
      onDoubleClick={() => {
        if (!disabled) onStartEdit(row.key)
      }}
    >
      {row.translation === '' ? <span className="muted">{t.status.untranslated}</span> : <TokenText text={row.translation} syntax={syntax} />}
    </span>
  )
}

function ConfidenceCell({ row }: { row: ReviewRow }): React.JSX.Element {
  const { lowConfidence } = useGridState()
  const value = parseConfidence(row.confidence)
  if (value === null) return <span className="grid-text muted">—</span>
  const low = value < lowConfidence && row.status !== 'approved'
  return <span className={low ? 'grid-text mono confidence low' : 'grid-text mono confidence'}>{value.toFixed(2)}</span>
}

function QaCell({ diagnostics }: { diagnostics: readonly QaDiagnostic[] }): React.JSX.Element | null {
  const t = useT()
  const errors = diagnostics.filter((item) => item.severity === 'error').length
  const warnings = diagnostics.length - errors
  if (diagnostics.length === 0) return null
  return (
    <span className="qa-pills" title={diagnostics.map((item) => item.message).join('\n')}>
      {errors > 0 ? <span className="qa-pill error">{t.grid.errors(errors)}</span> : null}
      {warnings > 0 ? <span className="qa-pill warning">{t.grid.warnings(warnings)}</span> : null}
    </span>
  )
}

const helper = createColumnHelper<ReviewRow>()

type Props = GridState & {
  rows: ReviewRow[]
  language: string
  selectedKey: string | null
  onSelect: (key: string | null) => void
}

export function ReviewGrid({
  rows,
  language,
  selectedKey,
  onSelect,
  syntax,
  lowConfidence,
  editing,
  disabled,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit
}: Props): React.JSX.Element {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [columnSizing, setColumnSizing] = useColumnSizing(SIZING_KEY)

  // 검토에서 가장 먼저 보는 상태와 QA 를 앞에 둔다. 에이전트 패널을 연 기본 창 너비에서 가로 스크롤 없이 들어간다.
  const columns = useMemo(
    () => [
      helper.accessor('key', {
        header: t.columns.key,
        size: 116,
        cell: (info) => <span className="token-key grid-text">{info.getValue()}</span>
      }),
      helper.accessor('status', {
        header: t.grid.status,
        size: 76,
        cell: (info) => <span className={`status-badge ${info.getValue()}`}>{statusLabel(info.getValue(), t)}</span>
      }),
      helper.display({
        id: 'qa',
        header: 'QA',
        size: 124,
        cell: (info) => <QaCell diagnostics={info.row.original.diagnostics} />
      }),
      helper.accessor('source', {
        header: t.columns.source,
        size: 200,
        cell: (info) => <SourceCell text={info.getValue()} />
      }),
      helper.accessor('translation', {
        id: 'translation',
        header: t.grid.translationIn(language),
        size: 222,
        cell: (info) => <TranslationCell row={info.row.original} />
      }),
      helper.accessor('confidence', {
        header: t.grid.confidence,
        size: 56,
        cell: (info) => <ConfidenceCell row={info.row.original} />
      })
    ],
    [language, t]
  )

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.key,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: { minSize: 50, maxSize: 900 },
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing
  })
  const modelRows = table.getRowModel().rows

  const getItemKey = useCallback((index: number) => rows[index]?.key ?? index, [rows])
  const virtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    getItemKey,
    scrollMargin: HEADER_HEIGHT,
    scrollPaddingStart: HEADER_HEIGHT
  })

  const selectedIndex = selectedKey === null ? -1 : rows.findIndex((row) => row.key === selectedKey)
  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
  }, [selectedIndex, virtualizer])

  const gridState = useMemo<GridState>(
    () => ({
      syntax,
      lowConfidence,
      editing,
      disabled,
      onStartEdit,
      onEditChange,
      onCommitEdit: (refocus) => {
        onCommitEdit(refocus)
        if (refocus) wrapRef.current?.focus()
      },
      onCancelEdit: () => {
        onCancelEdit()
        wrapRef.current?.focus()
      }
    }),
    [syntax, lowConfidence, editing, disabled, onStartEdit, onEditChange, onCommitEdit, onCancelEdit]
  )

  const columnSizes = table.getVisibleLeafColumns().map((column) => column.getSize())
  const template = columnSizes.map((size) => `${size}px`).join(' ')
  const totalWidth = `${columnSizes.reduce((sum, size) => sum + size, 0)}px`
  const resizing = table.getState().columnSizingInfo.isResizingColumn !== false

  return (
    <GridStateContext.Provider value={gridState}>
      <div
        ref={wrapRef}
        className={resizing ? 'grid-wrap resizing' : 'grid-wrap'}
        tabIndex={0}
        onKeyDown={(event) => {
          if (editing) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const next = Math.min(Math.max(selectedIndex + (event.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1)
            const key = rows[next]?.key
            if (key !== undefined) onSelect(key)
          } else if ((event.key === 'Enter' || event.key === 'F2') && selectedKey !== null && !disabled) {
            event.preventDefault()
            onStartEdit(selectedKey)
          }
        }}
      >
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
            <div className="grid-empty">{t.grid.noRows}</div>
          ) : (
            <div style={{ height: `${virtualizer.getTotalSize()}px`, width: totalWidth, position: 'relative' }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = modelRows[item.index]
                if (!row) return null
                const key = row.original.key
                return (
                  <div
                    key={row.id}
                    ref={virtualizer.measureElement}
                    data-index={item.index}
                    className={key === selectedKey ? 'grid-row selected' : 'grid-row'}
                    style={{
                      gridTemplateColumns: template,
                      transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`
                    }}
                    onMouseDown={() => onSelect(key)}
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
    </GridStateContext.Provider>
  )
}
