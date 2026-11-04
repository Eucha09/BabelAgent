import { useCallback, useMemo, useRef } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SmartSyntax } from '@core/qa/smart'
import type { ContextField, ContextFieldValues, ContextSuggestionView } from '@shared/schema/context'
import { useT } from '../i18n'
import { useColumnSizing } from '../state/column-sizing'
import { TokenText } from './TokenText'

const ROW_HEIGHT = 34
const HEADER_HEIGHT = 30
const SIZING_KEY = 'babel.contextGrid.columnSizing'

/** 그리드 한 줄. 사람이 고친 값(values)과 그 값의 문제를 제안과 함께 들고 있다. */
export type ContextGridRow = ContextSuggestionView & {
  values: ContextFieldValues
  problems: Partial<Record<ContextField, string>>
  selected: boolean
  low: boolean
  edited: boolean
}

type Props = {
  rows: ContextGridRow[]
  syntax: SmartSyntax
  onToggle: (key: string) => void
  onEdit: (key: string, field: ContextField, value: string) => void
}

const helper = createColumnHelper<ContextGridRow>()

/**
 * 제안한 칸만 고칠 수 있다. 제안하지 않은 칸은 원문 행의 지금 값을 흐리게 보여 준다 — 이미 채워져 있어 묻지 않은 칸이다.
 * 칸을 비우면 그 필드는 적용하지 않는다.
 */
function FieldCell({
  row,
  field,
  mono,
  onEdit
}: {
  row: ContextGridRow
  field: ContextField
  mono: boolean
  onEdit: Props['onEdit']
}): React.JSX.Element {
  const t = useT()
  if (row[field] === '') {
    const current = row.current[field]
    return (
      <span className={mono ? 'grid-text mono muted' : 'grid-text muted'} title={current ? t.contextGrid.currentValue : t.contextGrid.noSuggestion}>
        {current || '—'}
      </span>
    )
  }
  const problem = row.problems[field]
  const classes = ['grid-input']
  if (mono) classes.push('mono')
  if (problem) classes.push('invalid')
  return (
    <textarea
      rows={1}
      className={classes.join(' ')}
      value={row.values[field]}
      title={problem ?? t.contextGrid.editHint}
      onChange={(event) => onEdit(row.key, field, event.target.value)}
    />
  )
}

export function ContextGrid({ rows, syntax, onToggle, onEdit }: Props): React.JSX.Element {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [columnSizing, setColumnSizing] = useColumnSizing(SIZING_KEY)

  const columns = useMemo(() => {
    const field = (id: ContextField, header: string, size: number, mono = false) =>
      helper.display({
        id,
        header,
        size,
        cell: (info) => <FieldCell row={info.row.original} field={id} mono={mono} onEdit={onEdit} />
      })
    return [
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
            onChange={() => onToggle(info.row.original.key)}
            aria-label={t.grid.select(info.row.original.key)}
          />
        )
      }),
      helper.accessor('key', {
        header: t.columns.key,
        size: 140,
        cell: (info) => (
          <span className="grid-text">
            <span className="token-key">{info.getValue()}</span>
            {info.row.original.missing ? <span className="status-badge stale cell-badge">{t.contextGrid.missingSource}</span> : null}
            {info.row.original.stale ? (
              <span className="status-badge stale cell-badge" title={t.contextGrid.sourceChangedHint}>
                {t.contextGrid.sourceChanged}
              </span>
            ) : null}
          </span>
        )
      }),
      helper.accessor('source', {
        header: t.columns.source,
        size: 200,
        cell: (info) => <TokenText className="grid-text" text={info.getValue()} syntax={syntax} />
      }),
      field('context', t.columns.context, 220),
      field('ui_type', t.columns.ui_type, 96, true),
      field('max_len', t.columns.max_len, 70, true),
      field('vars', t.grid.varsNotes, 220, true),
      helper.accessor('confidence', {
        header: t.grid.confidence,
        size: 56,
        cell: (info) => (
          <span className={info.row.original.low ? 'grid-text mono confidence low' : 'grid-text mono confidence'}>
            {info.getValue() || '—'}
          </span>
        )
      }),
      helper.accessor('note', {
        header: t.grid.note,
        size: 200,
        cell: (info) => <span className="grid-text">{info.getValue()}</span>
      })
    ]
  }, [onEdit, onToggle, syntax, t])

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
          <div className="grid-empty">{t.contextGrid.empty}</div>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, width: totalWidth, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = modelRows[item.index]
              if (!row) return null
              const classes = ['grid-row']
              if (row.original.selected) classes.push('selected')
              if (row.original.edited) classes.push('edited')
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
