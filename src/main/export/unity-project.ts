import { existsSync, statSync } from 'node:fs'
import { open, readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { UnityScanResult } from '@core/export/plan'
import { parseUnityAsset, SNIFF_BYTES, sniffUnityAsset, type UnitySharedTable } from '@core/export/unity-yaml'
import type { UnityLocaleInfo } from '@shared/schema/export'
import { msg } from '../i18n'

/**
 * 연결한 Unity 프로젝트 폴더를 **읽기만** 한다. Assets/ 아래 .asset 파일의 앞부분으로 로케일·공유 데이터 에셋을 가리고
 * 그 파일만 YAML 로 읽는다. 쓰기는 하지 않는다.
 */

/** 문제 파일을 알림에 몇 개까지 적을지 */
const NOTICE_LIMIT = 5

/** project.json 에 저장할 경로: 프로젝트 폴더 기준 상대 경로(드라이브가 다르면 절대 경로), 구분자는 `/`. */
export function toStoredUnityPath(projectDir: string, unityDir: string): string {
  const rel = relative(projectDir, unityDir)
  return (rel === '' || isAbsolute(rel) ? unityDir : rel).split(sep).join('/')
}

export function resolveUnityPath(projectDir: string, stored: string): string {
  return resolve(projectDir, stored)
}

/** Unity 프로젝트 폴더인지(Assets/·ProjectSettings/ 가 있는지). 아니면 이유를 돌려준다. */
export function checkUnityProject(dir: string): string | null {
  try {
    if (!statSync(dir).isDirectory()) return msg().unityProject.notAFolder
  } catch {
    return msg().unityProject.folderNotFound
  }
  if (!existsSync(join(dir, 'Assets'))) return msg().unityProject.noAssets
  if (!existsSync(join(dir, 'ProjectSettings'))) return msg().unityProject.noProjectSettings
  return null
}

/** Unity 가 무시하는 폴더: `.` 으로 시작하거나 `~` 로 끝나는 이름 */
const ignoredByUnity = (name: string): boolean => name.startsWith('.') || name.endsWith('~')

async function listAssetFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const pending = [root]
  while (pending.length > 0) {
    const dir = pending.pop()
    if (dir === undefined) break
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (ignoredByUnity(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.asset')) files.push(path)
    }
  }
  return files.sort()
}

async function readHead(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

export async function scanUnityProject(dir: string, storedPath: string): Promise<UnityScanResult> {
  const problem = checkUnityProject(dir)
  if (problem !== null) return { state: 'failed', projectPath: storedPath, reason: problem }

  let files: string[]
  try {
    files = await listAssetFiles(join(dir, 'Assets'))
  } catch (error) {
    return { state: 'failed', projectPath: storedPath, reason: msg().unityProject.assetsUnreadable(error instanceof Error ? error.message : String(error)) }
  }

  const locales: UnityLocaleInfo[] = []
  const tables: UnitySharedTable[] = []
  const invalid: string[] = []
  let yamlFiles = 0
  let binaryFiles = 0

  for (const file of files) {
    let head: string
    try {
      head = await readHead(file)
    } catch {
      invalid.push(msg().unityProject.fileUnreadable(relative(dir, file)))
      continue
    }
    const kind = sniffUnityAsset(head)
    if (kind === 'binary') {
      binaryFiles += 1
      continue
    }
    yamlFiles += 1
    if (kind === 'other') continue
    try {
      const parsed = parseUnityAsset(await readFile(file, 'utf8'), kind, msg())
      if (parsed.kind === 'locale') locales.push(parsed.locale)
      else if (parsed.kind === 'shared-table') tables.push(parsed.table)
      else invalid.push(`${relative(dir, file)}: ${parsed.reason}`)
    } catch (error) {
      invalid.push(`${relative(dir, file)}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (yamlFiles === 0 && binaryFiles > 0) {
    return {
      state: 'failed',
      projectPath: storedPath,
      reason: msg().unityProject.allBinary
    }
  }
  if (locales.length === 0 && tables.length === 0) {
    const detail = invalid.length > 0 ? msg().unityProject.unreadableFiles(invalid.slice(0, NOTICE_LIMIT).join('; ')) : ''
    return {
      state: 'failed',
      projectPath: storedPath,
      reason: msg().unityProject.nothingFound(detail)
    }
  }

  const notices: string[] = []
  if (invalid.length > 0) {
    const more = invalid.length > NOTICE_LIMIT ? msg().unityProject.more(invalid.length - NOTICE_LIMIT) : ''
    notices.push(msg().unityProject.unreadableAssets(invalid.length, invalid.slice(0, NOTICE_LIMIT).join('; '), more))
  }
  if (binaryFiles > 0) {
    notices.push(msg().unityProject.binarySkipped(binaryFiles))
  }
  return { state: 'ok', projectPath: storedPath, locales, tables, notices }
}
