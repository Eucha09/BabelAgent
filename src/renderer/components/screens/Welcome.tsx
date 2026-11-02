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

      <div className="card">
        <h3>프로젝트 열기</h3>
        <div className="row">
          <button type="button" className="primary" onClick={onOpen} disabled={busy}>
            폴더 열기
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
