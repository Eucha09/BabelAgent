import type { ScreenDef } from '../../state/screens'

/** 아직 구현되지 않은 단계 화면. 사이드바 전환이 동작하는지 확인하는 용도다. */
export function Placeholder({ screen }: { screen: ScreenDef }): React.JSX.Element {
  return (
    <div>
      <h2 className="screen-title">{screen.label}</h2>
      <p className="screen-desc">{screen.description}</p>
      <div className="card">
        <h3>{screen.badge}에서 구현 예정</h3>
        <ul>
          {screen.planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="hint">진행 계획은 docs/roadmap.md에 있습니다.</p>
      </div>
    </div>
  )
}
