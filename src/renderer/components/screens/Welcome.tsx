import { useT } from '../../i18n'

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
  const t = useT()
  return (
    <div>
      <h2 className="screen-title">Babel Agent</h2>

      <div className="card">
        <h3>{t.welcome.openProject}</h3>
        <div className="row">
          <button type="button" className="primary" onClick={onOpen} disabled={busy}>
            {t.welcome.openFolder}
          </button>
          <button type="button" onClick={onCreate} disabled={busy}>
            {t.welcome.newProject}
          </button>
        </div>
      </div>

      {lastProjectDir ? (
        <div className="card">
          <h3>{t.welcome.recent}</h3>
          <p className="project-path">{lastProjectDir}</p>
          <button type="button" onClick={() => onOpenPath(lastProjectDir)} disabled={busy}>
            {t.welcome.reopen}
          </button>
        </div>
      ) : null}
    </div>
  )
}
