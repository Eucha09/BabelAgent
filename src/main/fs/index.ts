import { closeSync, fsyncSync, openSync, renameSync, writeSync } from 'node:fs'

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
      return `${path} 파일이 잠겨 있어 접근할 수 없습니다. 엑셀 등 다른 프로그램에서 열려 있는지 확인하세요.`
    case 'EACCES':
      return `${path} 에 접근할 권한이 없습니다.`
    case 'ENOENT':
      return `${path} 를 찾을 수 없습니다.`
    case 'ENOSPC':
      return '디스크 공간이 부족합니다.'
    default:
      return `${path} 처리 중 오류: ${error instanceof Error ? error.message : String(error)}`
  }
}
