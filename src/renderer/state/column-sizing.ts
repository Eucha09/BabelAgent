import { useEffect, useState } from 'react'
import type { ColumnSizingState } from '@tanstack/react-table'
import { z } from 'zod'

const SizingSchema = z.record(z.string(), z.number().positive())

function loadSizing(storageKey: string): ColumnSizingState {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = SizingSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : {}
  } catch {
    // 저장값이 깨졌으면 기본 너비로 시작한다
    return {}
  }
}

/** 사용자가 바꾼 열 너비. 화면을 오가거나 앱을 다시 켜도 유지한다. 그리드마다 저장 키를 따로 쓴다. */
export function useColumnSizing(
  storageKey: string
): [ColumnSizingState, React.Dispatch<React.SetStateAction<ColumnSizingState>>] {
  const [sizing, setSizing] = useState<ColumnSizingState>(() => loadSizing(storageKey))
  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(sizing))
  }, [sizing, storageKey])
  return [sizing, setSizing]
}
