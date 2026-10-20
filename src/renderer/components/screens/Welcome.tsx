type Props = {
  lastProjectDir: string | null
  busy: boolean
  onOpen: () => void
  onCreate: () => void
  onOpenPath: (dir: string) => void
}

/** 프로젝트가 열려 있지 않을 때의 시작 화면. */
export function Welcome({
  lastProjectDir,
  busy,
  onOpen,
  onCreate,
  onOpenPath
}: Props): React.JSX.Element {
  return (
    <div>
      <h2 className="screen-title">Babel Agent</h2>
      <p className="screen-desc">
        프로젝트는 폴더 하나이고 CSV 파일이 원본입니다. 폴더를 열면 그 안의 project.json을 읽고,
        새로 만들면 기본값으로 project.json을 생성합니다.
      </p>

      <div className="card">
        <h3>프로젝트 열기</h3>
        <p className="hint">project.json이 있는 폴더를 선택하세요.</p>
        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          <button type="button" className="primary" onClick={onOpen} disabled={busy}>
            폴더 선택해서 열기
          </button>
          <button type="button" onClick={onCreate} disabled={busy}>
            새 프로젝트 만들기
          </button>
        </div>
      </div>

      {lastProjectDir ? (
        <div className="card">
          <h3>최근 프로젝트</h3>
          <p className="project-path">{lastProjectDir}</p>
          <button type="button" onClick={() => onOpenPath(lastProjectDir)} disabled={busy}>
            다시 열기
          </button>
        </div>
      ) : null}
    </div>
  )
}
