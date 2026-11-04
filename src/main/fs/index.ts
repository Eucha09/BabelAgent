import { closeSync, fsyncSync, openSync, renameSync, writeSync } from 'node:fs'
import { msg } from '../i18n'

/**
 * 임시 파일에 쓰고 fsync 후 원자적으로 교체한다.
 * 쓰기 중 크래시로 원본이 깨지면 안 되므로 직접 덮어쓰지 않는다.
 */
export function writeFileAtomicSync(path: string, contents: string): void {
  const tmp = `${path}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, contents, null, 'utf8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
}

export function writeJsonAtomicSync(path: string, value: unknown): void {
  writeFileAtomicSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** 윈도우 파일 잠금 등 흔한 I/O 오류를 사용자가 읽을 수 있는 문장으로 바꾼다. */
export function describeIoError(error: unknown, path: string): string {
  const code = (error as { code?: string } | null)?.code
  switch (code) {
    case 'EBUSY':
    case 'EPERM':
      return msg().errors.fileLocked(path)
    case 'EACCES':
      return msg().errors.fileNoPermission(path)
    case 'ENOENT':
      return msg().errors.fileNotFound(path)
    case 'ENOSPC':
      return msg().errors.diskFull
    default:
      return msg().errors.fileError(path, error instanceof Error ? error.message : String(error))
  }
}
