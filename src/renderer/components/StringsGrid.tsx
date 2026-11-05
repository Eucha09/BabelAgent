import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { DropPosition } from '@core/strings/order'
import type { SmartSyntax } from '@core/qa/smart'
import { needsSmartSuggestion, parseSmartFlag } from '@core/strings/smart'
import type { StringsRow } from '@shared/schema/strings'
import { useT } from '../i18n'
import { useColumnSizing } from '../state/column-sizing'
import { statusLabel } from '../state/labels'
import { TokenText } from './TokenText'
import { TokenTextarea } from './TokenTextarea'

/** 한 줄짜리 행의 높이. 가상 스크롤의 첫 추정값이자 행의 최소 높이다. */
const ROW_HEIGHT = 34
/** 본문 스크롤 영역 안에 붙어 있는 헤더 높이. 가상 스크롤의 시작 위치가 이만큼 밀린다. */
const HEADER_HEIGHT = 30

/** 사용자가 바꾼 열 너비의 저장 키 */
const SIZING_KEY = 'babel.stringsGrid.columnSizing'

export type EditableField = 'source' | 'context' | 'ui_type' | 'max_len' | 'vars' | 'smart' | 'tags'

type DropTarget = { key: string; position: DropPosition }

type Props = {
  rows: StringsRow[]
  language: string | null
  /** Smart 구문 제안과 변수·태그 강조에 쓰는 토크나이저 설정(project.json smartStrings) */
  syntax: SmartSyntax
  /** 아직 저장하지 않은 새 행. 상태 칸에 따로 표시한다. */
  newKeys: ReadonlySet<string>
  selectedKey: string | null
  onSelect: (key: string) => void
  onEdit: (key: string, field: EditableField, value: string) => void
  onMove: (key: string, targetKey: string, position: DropPosition) => void
  onMoveBy: (key: string, offset: -1 | 1) => void
}


const helper = createColumnHelper<StringsRow>()

export function StringsGrid({
  rows,
  language,
  syntax,
  newKeys,
  selectedKey,
  onSelect,
  onEdit,
  onMove,
  onMoveBy
}: Props): React.JSX.Element {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [columnSizing, setColumnSizing] = useColumnSizing(SIZING_KEY)

  const columns = useMemo(() => {
    const editable = (field: EditableField, header: string, width: number, mono = false) =>
      helper.accessor((row) => row[field], {
        id: field,
        header,
        size: width,
        cell: (info) => (
          // input 은 값에서 줄바꿈을 지워 버린다. 원문에 줄바꿈이 있을 수 있어 textarea 를 쓴다.
          // 높이는 CSS(field-sizing: content)가 내용에 맞춘다.
          <textarea
            rows={1}
            className={mono ? 'grid-input mono' : 'grid-input'}
            value={info.getValue()}
            onChange={(event) => onEdit(info.row.original.key, field, event.target.value)}
          />
        )
      })

    return [
      helper.display({
        id: 'handle',
        header: '',
        size: 28,
        minSize: 28,
        maxSize: 28,
        enableResizing: false,
        cell: (info) => (
          <span
            className="drag-handle"
            draggable
            title={t.grid.dragToReorder}
            onDragStart={(event) => {
              const key = info.row.original.key
              event.dataTransfer.setData('text/plain', key)
              event.dataTransfer.effectAllowed = 'move'
              const rowElement = event.currentTarget.closest('.grid-row')
              if (rowElement) event.dataTransfer.setDragImage(rowElement, 14, ROW_HEIGHT / 2)
              setDragKey(key)
            }}
          >
            ⠿
          </span>
        )
      }),
      helper.accessor('key', {
        header: t.columns.key,
        size: 150,
        cell: (info) => <span className="token-key grid-text">{info.getValue()}</span>
      }),
      // 원문은 변수·태그를 색으로 보여 주고, 포커스를 받으면 편집 칸으로 바뀐다
      helper.accessor('source', {
        header: t.columns.source,
        size: 260,
        cell: (info) => (
          <TokenTextarea
            value={info.getValue()}
            syntax={syntax}
            onChange={(value) => onEdit(info.row.original.key, 'source', value)}
          />
        )
      }),
      editable('context', t.columns.context, 170),
      editable('ui_type', t.columns.ui_type, 90, true),
      editable('max_len', t.columns.max_len, 70, true),
      // 변수 메타데이터(JSON 배열). 형식이 틀리면 검토 화면이 경고한다
      editable('vars', t.columns.vars, 150, true),
      // Unity Smart String 여부. 미정인데 원문에 Smart 구문이 있으면 "제안"을 붙인다
      helper.accessor('smart', {
        header: 'Smart',
        size: 104,
        cell: (info) => {
          const flag = parseSmartFlag(info.getValue())
          const row = info.row.original
          return (
            <div className="smart-cell">
              <select
                className="grid-select"
                value={flag === null ? '' : String(flag)}
                title={flag === null && info.getValue().trim() !== '' ? t.grid.smartUnknown(info.getValue()) : undefined}
                onChange={(event) => onEdit(row.key, 'smart', event.target.value)}
              >
                <option value="">{t.grid.smartUnset}</option>
                <option value="true">Smart</option>
                <option value="false">{t.grid.smartOff}</option>
              </select>
              {needsSmartSuggestion(row, syntax) ? (
                <span className="badge warn" title={t.grid.smartHasSyntax}>
                  {t.grid.smartSuggest}
                </span>
              ) : null}
            </div>
          )
        }
      }),
      editable('tags', t.columns.tags, 100, true),
      helper.accessor('translation', {
        header: language ? t.grid.translationIn(language) : t.grid.translation,
        size: 240,
        cell: (info) => <TokenText className="grid-text" text={info.getValue()} syntax={syntax} />
      }),
      helper.accessor('status', {
        header: t.grid.status,
        size: 96,
        cell: (info) =>
          newKeys.has(info.row.original.key) ? (
            <span className="status-badge new">{t.grid.newRow}</span>
          ) : (
            <span className={`status-badge ${info.getValue()}`}>{statusLabel(info.getValue(), t)}</span>
          )
      })
    ]
  }, [language, newKeys, onEdit, syntax, t])

  const table = useReactTable({
    data: rows,
    columns,
    // 인덱스가 아니라 키를 행의 정체로 쓴다. 순서를 바꿔도 편집 중인 칸이 다른 행으로 옮겨 가지 않는다.
    getRowId: (row) => row.key,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: { minSize: 60, maxSize: 900 },
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing
  })
  const modelRows = table.getRowModel().rows

  // 가상 스크롤은 이 함수의 정체를 측정 캐시의 기준으로 쓴다. 렌더마다 새로 만들면
  // 측정 → 다시 렌더 → 새 함수 → 다시 측정이 끝없이 돈다. 행 목록이 바뀔 때만 바꾼다.
  const getItemKey = useCallback((index: number) => rows[index]?.key ?? index, [rows])

  const virtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    // 행 높이는 내용에 따라 다르므로 실제로 잰다. 측정값은 키로 기억해서
    // 순서를 바꾸거나 행을 지워도 높이가 엉뚱한 행에 붙지 않게 한다.
    getItemKey,
    // 헤더가 같은 스크롤 영역 안에 있으므로 목록은 헤더 높이만큼 아래에서 시작한다
    scrollMargin: HEADER_HEIGHT,
    // 행으로 스크롤할 때 고정 헤더 밑에 가려지지 않게 한다
    scrollPaddingStart: HEADER_HEIGHT
  })

  // 선택한 행이 추가·이동으로 화면 밖에 있으면 보이는 곳까지 스크롤한다
  const selectedIndex = selectedKey === null ? -1 : rows.findIndex((row) => row.key === selectedKey)
  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
  }, [selectedIndex, virtualizer])

  // 끌던 행이 가상 스크롤로 사라지면 dragend가 오지 않을 수 있어 창 전체에서 정리한다
  useEffect(() => {
    if (dragKey === null) return
    const clear = (): void => {
      setDragKey(null)
      setDropTarget(null)
    }
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      window.removeEventListener('drop', clear)
    }
  }, [dragKey])

  const columnSizes = table.getVisibleLeafColumns().map((column) => column.getSize())
  const template = columnSizes.map((size) => `${size}px`).join(' ')
  const totalWidth = `${columnSizes.reduce((sum, size) => sum + size, 0)}px`
  const resizing = table.getState().columnSizingInfo.isResizingColumn !== false

  return (
    <div
      className={resizing ? 'grid-wrap resizing' : 'grid-wrap'}
      tabIndex={0}
      onKeyDown={(event) => {
        if (!event.altKey || selectedKey === null) return
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          onMoveBy(selectedKey, event.key === 'ArrowUp' ? -1 : 1)
        }
      }}
    >
      <div className="grid-body" ref={scrollRef}>
        <div
          className="grid-head"
          style={{ gridTemplateColumns: template, width: totalWidth, height: HEADER_HEIGHT }}
        >
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

        <div style={{ height: `${virtualizer.getTotalSize()}px`, width: totalWidth, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = modelRows[item.index]
            if (!row) return null
            const key = row.original.key
            const classes = ['grid-row']
            if (key === selectedKey) classes.push('selected')
            if (key === dragKey) classes.push('dragging')
            if (dropTarget?.key === key) classes.push(`drop-${dropTarget.position}`)

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
                onMouseDown={() => onSelect(key)}
                onDragOver={(event) => {
                  if (dragKey === null) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  const rect = event.currentTarget.getBoundingClientRect()
                  const position: DropPosition =
                    event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                  if (dropTarget?.key !== key || dropTarget.position !== position) {
                    setDropTarget({ key, position })
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragKey !== null && dropTarget !== null) {
                    onMove(dragKey, dropTarget.key, dropTarget.position)
                  }
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
      </div>
    </div>
  )
}
