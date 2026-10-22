import { basename, extname } from 'node:path'
import type { FSWatcher } from 'chokidar'
import type * as Chokidar from 'chokidar'
import type { WebContents } from 'electron'
import { IPC_EVENT } from '@shared/ipc'
import type { FileChanged } from '@shared/schema/strings'
import { PROJECT_FILE } from './open'
import { isKnownContent } from './store'

/** chokidar 5는 ESM 전용이라 CJS 번들에서 동적으로 가져온다. Agent SDK와 같은 이유다. */
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<typeof Chokidar>

let watcher: FSWatcher | null = null

const WATCHED = new Set(['.csv', '.json'])

/**
 * 프로젝트 폴더를 감시한다. project.json 이 바뀌면 onConfigChanged 로 알려 메인이 설정을 다시 읽게 한다 —
 * 그렇지 않으면 손으로 고친 smartStrings·톤 가이드가 프로젝트를 다시 열 때까지 반영되지 않는다.
 * onConfigChanged 는 설정이 실제로 달라졌는지 돌려준다. 앱이 직접 저장한 경우(내용이 같음)는 알리지 않는다.
 */
export async function watchProject(dir: string, sender: WebContents, onConfigChanged: () => boolean): Promise<void> {
  await stopWatching()
  const chokidar = await dynamicImport('chokidar')

  const notify = (path: string): void => {
    if (!WATCHED.has(extname(path).toLowerCase())) return
    // 앱이 방금 쓴 내용이면 외부 변경이 아니다
    if (isKnownContent(path)) return
    if (sender.isDestroyed()) return
    const payload: FileChanged = { file: basename(path) }
    if (payload.file === PROJECT_FILE && !onConfigChanged()) return
    sender.send(IPC_EVENT.fileChanged, payload)
  }

  watcher = chokidar.watch(dir, {
    depth: 0,
    ignoreInitial: true,
    // 엑셀처럼 여러 번에 나눠 쓰는 프로그램 때문에 쓰기가 멈출 때까지 기다린다
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 }
  })

  watcher.on('change', notify)
  watcher.on('add', notify)
  watcher.on('unlink', notify)
}

export async function stopWatching(): Promise<void> {
  if (!watcher) return
  await watcher.close()
  watcher = null
}
