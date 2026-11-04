import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { TranslationStatus } from '@shared/schema/project'
import { useT } from '../i18n'
import { statusLabel } from '../state/labels'

/** status 는 번역 화면에서만 준다(승인된 행은 고를 수 없다). 컨텍스트·용어 화면은 원문만 보여 준다. */
export type ChecklistItem = { key: string; source: string; status?: TranslationStatus }

type Props = {
  items: readonly ChecklistItem[]
  selected: ReadonlySet<string>
  disabled: boolean
  onChange: (next: Set<string>) => void
}

const ROW_HEIGHT = 30

/** 작업할 행을 고르는 체크 목록. 번역에서는 승인된 행을 고를 수 없다. */
export function KeyChecklist({ items, selected, disabled, onChange }: Props): React.JSX.Element {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16
  })

  const toggle = (key: string): void => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }

  return (
    <div className="checklist" ref={scrollRef}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtual) => {
          const item = items[virtual.index]
          if (!item) return null
          const approved = item.status === 'approved'
          return (
            <label
              key={item.key}
              className={approved ? 'checklist-row approved' : 'checklist-row'}
              style={{ height: ROW_HEIGHT, transform: `translateY(${virtual.start}px)` }}
              title={approved ? t.common.approvedNotTranslated : item.source}
            >
              <input
                type="checkbox"
                checked={selected.has(item.key)}
                disabled={disabled || approved}
                onChange={() => toggle(item.key)}
              />
              <span className="token-key checklist-key">{item.key}</span>
              <span className="checklist-source">{item.source}</span>
              {item.status ? (
                <span className={`status-badge ${item.status}`}>{statusLabel(item.status, t)}</span>
              ) : (
                <span />
              )}
            </label>
          )
        })}
      </div>
    </div>
  )
}
