/** 바벨탑 아이콘. build/icon.svg 에서 생성된다 — 직접 고치지 말고 `npm run icon` 을 돌릴 것. */
export function AppIcon({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      className="app-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path transform="rotate(-3.5 12 5.4)" d="M9.6 2.6 L14.4 2.6 Q15.4 2.6 15.4 3.6 L15.4 7.2 Q15.4 8.2 14.4 8.2 L12.85 8.2 L12.85 6.45 A0.85 0.85 0 0 0 11.15 6.45 L11.15 8.2 L9.6 8.2 Q8.6 8.2 8.6 7.2 L8.6 3.6 Q8.6 2.6 9.6 2.6 Z" />
      <path transform="rotate(-3.5 12 11.8)" d="M6.9 9 L17.1 9 Q18.1 9 18.1 10 L18.1 13.6 Q18.1 14.6 17.1 14.6 L12.95 14.6 L12.95 12.65 A0.95 0.95 0 0 0 11.05 12.65 L11.05 14.6 L6.9 14.6 Q5.9 14.6 5.9 13.6 L5.9 10 Q5.9 9 6.9 9 Z" />
      <path d="M4.2 15.4 L19.8 15.4 Q20.8 15.4 20.8 16.4 L20.8 20 Q20.8 21 19.8 21 L13.05 21 L13.05 18.85 A1.05 1.05 0 0 0 10.95 18.85 L10.95 21 L4.2 21 Q3.2 21 3.2 20 L3.2 16.4 Q3.2 15.4 4.2 15.4 Z" />
    </svg>
  )
}
