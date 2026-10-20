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

export const PROJECT_FILE = 'project.json'

function configPath(dir: string): string {
  return join(dir, PROJECT_FILE)
}

function checkDir(dir: string): IpcResult<string> {
  if (!isAbsolute(dir)) return fail('io', '프로젝트 경로는 절대 경로여야 합니다.', dir)
  try {
    if (!statSync(dir).isDirectory()) return fail('io', '폴더가 아닙니다.', dir)
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
      '이미 Babel Agent 프로젝트인 폴더입니다. "프로젝트 열기"를 사용하세요.',
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

export function openProject(dir: string): IpcResult<OpenProject> {
  const dirCheck = checkDir(dir)
  if (!dirCheck.ok) return dirCheck
  const path = configPath(dir)
  if (!existsSync(path)) {
    return fail(
      'not-a-project',
      `${PROJECT_FILE} 이 없는 폴더입니다. 새 프로젝트로 만들거나 다른 폴더를 선택하세요.`,
      path
    )
  }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) {
      return fail('invalid-project', `${PROJECT_FILE} 을 읽을 수 없습니다. JSON 형식이 올바르지 않습니다.`, error.message)
    }
    return fail('io', describeIoError(error, path))
  }

  const found = (raw as { schemaVersion?: unknown } | null)?.schemaVersion
  const verdict = checkSchemaVersion(found)
  switch (verdict.kind) {
    case 'invalid':
      return fail(
        'invalid-project',
        `${PROJECT_FILE} 의 schemaVersion 이 올바르지 않습니다.`,
        `읽은 값: ${JSON.stringify(found)}`
      )
    case 'too-new':
      return fail(
        'schema-too-new',
        `이 프로젝트는 더 새로운 버전의 Babel Agent에서 만들어졌습니다(schemaVersion ${verdict.found}). 앱을 업데이트하세요.`,
        `앱이 지원하는 버전: ${verdict.supported}`
      )
    case 'migrate':
      // 마이그레이션 함수는 schemaVersion 2를 도입할 때 추가한다. docs/data-format.md 참조.
      return fail(
        'invalid-project',
        `schemaVersion ${verdict.from} → ${verdict.to} 마이그레이션이 아직 구현되지 않았습니다.`
      )
    case 'ok':
      break
  }

  const parsed = ProjectConfig.safeParse(raw)
  if (!parsed.success) {
    return fail(
      'invalid-project',
      `${PROJECT_FILE} 의 내용이 스키마와 맞지 않습니다.`,
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
    )
  }
  return ok({ dir, config: parsed.data })
}
