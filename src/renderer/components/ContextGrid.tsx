import { useCallback, useMemo, useRef } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SmartSyntax } from '@core/qa/smart'
import type { ContextField, ContextFieldValues, ContextSuggestionView } from '@shared/schema/context'
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
  if (row[field] === '') {
    const current = row.current[field]
    return (
      <span className={mono ? 'grid-text mono muted' : 'grid-text muted'} title={current ? '원문 행에 이미 있는 값' : '제안 없음'}>
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
      title={problem ?? '고친 값이 적용됩니다. 비우면 이 필드는 적용하지 않습니다.'}
      onChange={(event) => onEdit(row.key, field, event.target.value)}
    />
  )
}

export function ContextGrid({ rows, syntax, onToggle, onEdit }: Props): React.JSX.Element {
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
            aria-label={`${info.row.original.key} 선택`}
          />
        )
      }),
      helper.accessor('key', {
        header: '키',
        size: 140,
        cell: (info) => (
          <span className="grid-text">
            <span className="token-key">{info.getValue()}</span>
            {info.row.original.missing ? <span className="status-badge stale cell-badge">원문 없음</span> : null}
            {info.row.original.stale ? (
              <span className="status-badge stale cell-badge" title="제안한 뒤 원문이 바뀌었습니다. 새 원문에 맞는지 확인하세요.">
                원문 변경
              </span>
            ) : null}
          </span>
        )
      }),
      helper.accessor('source', {
        header: '원문',
        size: 200,
        cell: (info) => <TokenText className="grid-text" text={info.getValue()} syntax={syntax} />
      }),
      field('context', '컨텍스트', 220),
      field('ui_type', 'UI 유형', 96, true),
      field('max_len', '최대 길이', 70, true),
      field('vars', '변수 설명 (vars)', 220, true),
      helper.accessor('confidence', {
        header: '신뢰도',
        size: 56,
        cell: (info) => (
          <span className={info.row.original.low ? 'grid-text mono confidence low' : 'grid-text mono confidence'}>
            {info.getValue() || '—'}
          </span>
        )
      }),
      helper.accessor('note', {
        header: '메모',
        size: 200,
        cell: (info) => <span className="grid-text">{info.getValue()}</span>
      })
    ]
  }, [onEdit, onToggle, syntax])

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
                  title="끌어서 너비 조절 · 더블클릭하면 기본 너비"
                  onMouseDown={header.getResizeHandler()}
                  onTouchStart={header.getResizeHandler()}
                  onDoubleClick={() => header.column.resetSize()}
                />
              ) : null}
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="grid-empty">승인을 기다리는 제안이 없습니다.</div>
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
