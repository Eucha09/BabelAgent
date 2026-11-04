import type { OpenProject } from '@shared/schema/project'
import { useT } from '../i18n'
import { SCREENS, type ScreenId } from '../state/screens'

type Props = {
  project: OpenProject | null
  current: ScreenId
  onSelect: (id: ScreenId) => void
  onOpen: () => void
  onCreate: () => void
  onClose: () => void
  busy: boolean
}

export function Sidebar({
  project,
  current,
  onSelect,
  onOpen,
  onCreate,
  onClose,
  busy
}: Props): React.JSX.Element {
  const t = useT()
  return (
    <nav className="sidebar">
      <div className="project-box">
        <div className="nav-section" style={{ padding: 0, marginBottom: 'var(--space-1)' }}>
          {t.sidebar.project}
        </div>
        <div className="project-name">{project ? project.config.name : t.sidebar.noProject}</div>
        <div className="project-path">
          {project
            ? `${project.config.sourceLanguage} → ${project.config.targetLanguages.join(', ') || t.sidebar.noTargets}`
            : t.sidebar.openOrCreate}
        </div>
        <div className="row">
          {project ? (
            <button type="button" onClick={onClose} disabled={busy}>
              {t.sidebar.close}
            </button>
          ) : (
            <>
              <button type="button" onClick={onOpen} disabled={busy}>
                {t.sidebar.open}
              </button>
              <button type="button" onClick={onCreate} disabled={busy}>
                {t.sidebar.create}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="nav-section">{t.sidebar.steps}</div>
      <ul className="nav">
        {SCREENS.map((screen) => {
          const disabled = screen.requiresProject && !project
          return (
            <li key={screen.id}>
              <button
                type="button"
                className={`nav-item${current === screen.id ? ' selected' : ''}`}
                onClick={() => onSelect(screen.id)}
                disabled={disabled}
                title={disabled ? t.sidebar.needsProject : t.screens[screen.id].description}
              >
                <span>{t.screens[screen.id].label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
