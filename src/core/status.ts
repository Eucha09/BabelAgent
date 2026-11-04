import type { TranslationStatus } from '@shared/schema/project'
import type { TranslationRow } from '@shared/schema/strings'
import type { MasterSource } from './translate/merge'
import type { Messages } from '@shared/i18n'

/**
 * 사람이 검토 화면에서 행 하나를 고칠 때의 상태 전이 판정. 상태도는 docs/data-format.md.
 * 배치 기록(→ draft)은 translate/merge.ts, 원문 변경(→ stale)은 strings/stale.ts 가 맡는다.
 */

export type ManualUpdate = {
  text: string
  status: TranslationStatus
  /** undefined 면 기존 메모를 둔다. */
  note?: string
  /** 재번역 후보를 적용할 때 에이전트가 낸 신뢰도. undefined 면 규칙대로(글이 바뀌면 비운다). */
  confidence?: string
}

export type ManualUpdateResult = { ok: true; row: TranslationRow } | { ok: false; reason: string }


/**
 * - 글을 비우면 미번역이 된다. 빈 글을 다른 상태로 둘 수 없고, 글이 있는 행을 미번역으로 둘 수도 없다.
 * - stale 은 원문이 바뀔 때만 붙는다. 사람이 고르는 상태가 아니다. stale 행의 메모만 고치면 stale 로 남는다.
 * - 글이나 상태를 바꾸면 "지금 원문을 보고 판단했다"는 뜻이므로 해시와 원문 스냅숏을 지금 원문에 맞춘다.
 *   stale 행을 글 그대로 검토·승인하면 옛 번역이 새 원문에도 맞다고 확인한 것이다.
 * - 메모만 고치면 해시를 건드리지 않는다. 메모 때문에 stale 이 풀리면 안 된다.
 * - 사람이 글을 고치면 에이전트의 신뢰도는 더는 그 글의 값이 아니므로 비운다.
 */
export function applyManualUpdate(
  key: string,
  previous: TranslationRow | undefined,
  update: ManualUpdate,
  master: MasterSource,
  t: Messages
): ManualUpdateResult {
  const previousText = previous?.text ?? ''
  const previousStatus = previous?.status ?? 'untranslated'
  const empty = update.text.trim() === ''
  const textChanged = update.text !== previousText
  const statusChanged = update.status !== previousStatus

  if (update.status === 'stale' && (previousStatus !== 'stale' || textChanged)) {
    return { ok: false, reason: t.statusCheck.staleManual }
  }
  if (empty && update.status !== 'untranslated') {
    return { ok: false, reason: t.statusCheck.emptyWithStatus(t.status[update.status]) }
  }
  if (!empty && update.status === 'untranslated') {
    return { ok: false, reason: t.statusCheck.textAsUntranslated }
  }

  const rebase = empty || textChanged || statusChanged
  return {
    ok: true,
    row: {
      key,
      text: update.text,
      status: update.status,
      source_hash: rebase ? master.source_hash : (previous?.source_hash ?? master.source_hash),
      source_snapshot: empty ? '' : rebase ? master.source : (previous?.source_snapshot ?? master.source),
      confidence: update.confidence ?? (textChanged || empty ? '' : (previous?.confidence ?? '')),
      note: update.note ?? previous?.note ?? ''
    }
  }
}
