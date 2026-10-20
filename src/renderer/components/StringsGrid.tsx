import { useMemo, useRef } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { StringsRow } from '@shared/schema/strings'

const ROW_HEIGHT = 34

export type EditableField = 'source' | 'context' | 'ui_type' | 'max_len' | 'tags'

type Props = {
  rows: StringsRow[]
  language: string | null
  onEdit: (key: string, field: EditableField, value: string) => void
}

const STATUS_LABEL: Record<string, string> = {
  untranslated: '미번역',
  draft: '초안',
  review: '검토',
  approved: '승인',
  stale: '원문변경'
}

const helper = createColumnHelper<StringsRow>()

export function StringsGrid({ rows, language, onEdit }: Props): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)

  const columns = useMemo(() => {
    const editable = (field: EditableField, header: string, width: number, mono = false) =>
      helper.accessor((row) => row[field], {
        id: field,
        header,
        size: width,
        cell: (info) => (
          // input 은 값에서 줄바꿈을 지워 버린다. 원문에 줄바꿈이 있을 수 있어 textarea 를 쓴다.
          <textarea
            rows={1}
            className={mono ? 'grid-input mono' : 'grid-input'}
            value={info.getValue()}
            title={info.getValue()}
            onChange={(event) => onEdit(info.row.original.key, field, event.target.value)}
          />
        )
      })

    return [
      helper.accessor('key', {
        header: '키',
        size: 150,
        cell: (info) => <span className="token-key grid-text">{info.getValue()}</span>
      }),
      editable('source', '원문', 260),
      editable('context', '컨텍스트', 170),
      editable('ui_type', 'UI 유형', 90, true),
      editable('max_len', '최대 길이', 70, true),
      editable('tags', '태그', 100, true),
      helper.accessor('translation', {
        header: language ? `번역 (${language})` : '번역',
        size: 240,
        cell: (info) => <span className="grid-text">{info.getValue()}</span>
      }),
      helper.accessor('status', {
        header: '상태',
        size: 96,
        cell: (info) => (
          <span className={`status-badge ${info.getValue()}`}>
            {STATUS_LABEL[info.getValue()] ?? info.getValue()}
          </span>
        )
      })
    ]
  }, [language, onEdit])

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })
  const modelRows = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  const columnSizes = table.getVisibleLeafColumns().map((column) => column.getSize())
  const template = columnSizes.map((size) => `${size}px`).join(' ')
  const totalWidth = `${columnSizes.reduce((sum, size) => sum + size, 0)}px`

  return (
    <div className="grid-wrap">
      <div
        className="grid-head"
        ref={headRef}
        style={{ gridTemplateColumns: template, minWidth: totalWidth }}
      >
        {table.getHeaderGroups()[0]?.headers.map((header) => (
          <div key={header.id} className="grid-cell grid-header-cell">
            {flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        ))}
      </div>

      <div
        className="grid-body"
        ref={scrollRef}
        onScroll={(event) => {
          // 헤더는 따로 떠 있으므로 가로 스크롤을 맞춰 준다
          if (headRef.current) headRef.current.scrollLeft = event.currentTarget.scrollLeft
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: template.split(' ').length > 0 ? totalWidth : undefined,
            position: 'relative'
          }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = modelRows[item.index]
            if (!row) return null
            return (
              <div
                key={row.id}
                className="grid-row"
                style={{
                  gridTemplateColumns: template,
                  height: `${item.size}px`,
                  transform: `translateY(${item.start}px)`
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
