import { SCREENS, type ScreenId } from '../state/screens'
import type { OpenProject } from '@shared/schema/project'

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
  return (
    <nav className="sidebar">
      <div className="project-box">
        <div className="nav-section" style={{ padding: 0, marginBottom: 'var(--space-1)' }}>
          프로젝트
        </div>
        <div className="project-name">{project ? project.config.name : '열린 프로젝트 없음'}</div>
        <div className="project-path">
          {project ? `${project.config.sourceLanguage} → ${project.config.targetLanguages.join(', ') || '대상 언어 없음'}` : '폴더를 열거나 새로 만드세요'}
        </div>
        <div className="row">
          {project ? (
            <button type="button" onClick={onClose} disabled={busy}>
              닫기
            </button>
          ) : (
            <>
              <button type="button" onClick={onOpen} disabled={busy}>
                열기
              </button>
              <button type="button" onClick={onCreate} disabled={busy}>
                새로 만들기
              </button>
            </>
          )}
        </div>
      </div>

      <div className="nav-section">단계</div>
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
                title={disabled ? '프로젝트를 먼저 열어야 합니다' : screen.description}
              >
                <span>{screen.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
