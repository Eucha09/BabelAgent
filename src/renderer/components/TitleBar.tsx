import type { OpenProject } from '@shared/schema/project'
import { AppIcon } from './AppIcon'

type Props = {
  project: OpenProject | null
  screenLabel: string
}

/**
 * 창 제목 영역. 드래그 영역이자 현재 맥락을 보여주는 칩 줄이다.
 * 오른쪽 끝은 OS 창 버튼(titleBarOverlay)이 그려지므로 CSS에서 비워 둔다.
 */
export function TitleBar({ project, screenLabel }: Props): React.JSX.Element {
  return (
    <header className="titlebar">
      <span className="app-mark">
        <AppIcon size={18} />
        Babel Agent
      </span>

      <span className="chip mono" title={project?.dir ?? ''}>
        {project ? project.dir : '프로젝트 없음'}
      </span>

      <span className="chip">{screenLabel}</span>

      {project ? (
        <span className="chip mono">
          {project.config.sourceLanguage} → {project.config.targetLanguages.join(' · ') || '없음'}
        </span>
      ) : null}
    </header>
  )
}
