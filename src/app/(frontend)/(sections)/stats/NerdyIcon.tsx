export type NerdyKind =
  'quickest' | 'slowest' | 'thickest' | 'dust' | 'mostExpensive' | 'bestMonth' | 'topAuthor'

/** The Stats canvas's line icons (mockups/bold-metro/Stats.dc.html), 24 × 24, 2px stroke. */
const PATHS: Record<NerdyKind, string> = {
  quickest: 'M13 3L5 14h6l-1 7 8-11h-6z',
  slowest: 'M7 3h10M7 21h10M8 3v3l4 6-4 6v3M16 3v3l-4 6 4 6v3',
  thickest: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  dust: 'M3 6c3-1 6-1 9 1 3-2 6-2 9-1v12c-3-1-6-1-9 1-3-2-6-2-9-1zM12 7v12',
  mostExpensive: 'M17 6.5a6.5 6.5 0 100 11M4 10h10M4 14h10',
  bestMonth: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  topAuthor: 'M12 4a4 4 0 110 8 4 4 0 010-8zM4 21c1-4 4-6 8-6s7 2 8 6',
}

export function NerdyIcon({ kind }: { kind: NerdyKind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-fact-icon shrink-0 text-accent"
    >
      <path d={PATHS[kind]} />
    </svg>
  )
}
