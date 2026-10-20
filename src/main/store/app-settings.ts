import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { AppSettings, DEFAULT_APP_SETTINGS, type AppSettingsPatch } from '@shared/schema/app-settings'
import { writeJsonAtomicSync } from '../fs'

let cached: AppSettings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** 파일이 없거나 깨졌으면 기본값으로 되돌린다. 설정 파일 하나로 앱이 못 켜지면 안 된다. */
export function loadAppSettings(): AppSettings {
  if (cached) return cached
  const path = settingsPath()
  if (!existsSync(path)) {
    cached = { ...DEFAULT_APP_SETTINGS }
    return cached
  }
  try {
    const parsed = AppSettings.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    cached = parsed.success ? parsed.data : { ...DEFAULT_APP_SETTINGS }
  } catch {
    cached = { ...DEFAULT_APP_SETTINGS }
  }
  return cached
}

export function updateAppSettings(patch: AppSettingsPatch): AppSettings {
  const next: AppSettings = { ...loadAppSettings(), ...patch }
  writeJsonAtomicSync(settingsPath(), next)
  cached = next
  return next
}
