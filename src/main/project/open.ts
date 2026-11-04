import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { checkSchemaVersion, SUPPORTED_SCHEMA_VERSION } from '@core/project/schema-version'
import {
  ProjectConfig,
  createDefaultProjectConfig,
  type CreateProjectInput,
  type OpenProject
} from '@shared/schema/project'
import { fail, ok, type IpcResult } from '@shared/types'
import { describeIoError, writeJsonAtomicSync } from '../fs'
import { msg } from '../i18n'

export const PROJECT_FILE = 'project.json'

function configPath(dir: string): string {
  return join(dir, PROJECT_FILE)
}

function checkDir(dir: string): IpcResult<string> {
  if (!isAbsolute(dir)) return fail('io', msg().errors.pathNotAbsolute, dir)
  try {
    if (!statSync(dir).isDirectory()) return fail('io', msg().errors.notAFolder, dir)
  } catch (error) {
    return fail('io', describeIoError(error, dir))
  }
  return ok(dir)
}

export function createProject(input: CreateProjectInput): IpcResult<OpenProject> {
  const dirCheck = checkDir(input.dir)
  if (!dirCheck.ok) return dirCheck
  const path = configPath(input.dir)
  if (existsSync(path)) {
    return fail(
      'already-a-project',
      msg().errors.alreadyProject,
      path
    )
  }
  const config = createDefaultProjectConfig({
    name: input.name,
    sourceLanguage: input.sourceLanguage,
    targetLanguages: input.targetLanguages,
    schemaVersion: SUPPORTED_SCHEMA_VERSION
  })
  try {
    writeJsonAtomicSync(path, config)
  } catch (error) {
    return fail('io', describeIoError(error, path))
  }
  return ok({ dir: input.dir, config })
}

/** project.json 을 원자적으로 다시 쓴다. 스키마를 통과한 설정만 받는다. */
export function saveProjectConfig(dir: string, config: ProjectConfig): IpcResult<null> {
  const path = configPath(dir)
  try {
    writeJsonAtomicSync(path, config)
    return ok(null)
  } catch (error) {
    return fail('io', describeIoError(error, path))
  }
}

export function openProject(dir: string): IpcResult<OpenProject> {
  const dirCheck = checkDir(dir)
  if (!dirCheck.ok) return dirCheck
  const path = configPath(dir)
  if (!existsSync(path)) {
    return fail(
      'not-a-project',
      msg().errors.noProjectFile(PROJECT_FILE),
      path
    )
  }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) {
      return fail('invalid-project', msg().errors.projectJsonInvalid(PROJECT_FILE), error.message)
    }
    return fail('io', describeIoError(error, path))
  }

  const found = (raw as { schemaVersion?: unknown } | null)?.schemaVersion
  const verdict = checkSchemaVersion(found)
  switch (verdict.kind) {
    case 'invalid':
      return fail(
        'invalid-project',
        msg().errors.schemaVersionInvalid(PROJECT_FILE),
        msg().errors.readValue(JSON.stringify(found))
      )
    case 'too-new':
      return fail(
        'schema-too-new',
        msg().errors.schemaTooNew(verdict.found),
        msg().errors.supportedVersion(verdict.supported)
      )
    case 'migrate':
      // 마이그레이션 함수는 schemaVersion 2를 도입할 때 추가한다. docs/data-format.md 참조.
      return fail(
        'invalid-project',
        msg().errors.migrationMissing(verdict.from, verdict.to)
      )
    case 'ok':
      break
  }

  const parsed = ProjectConfig.safeParse(raw)
  if (!parsed.success) {
    return fail(
      'invalid-project',
      msg().errors.projectSchemaMismatch(PROJECT_FILE),
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
    )
  }
  return ok({ dir, config: parsed.data })
}
