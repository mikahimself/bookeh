import type { ReactNode } from 'react'

/**
 * DESIGN.md, List row: the name in `title`, its count right in muted `meta`,
 * then the row's Links; on the phone the Links wrap to a second line. The
 * row itself is not tappable. An `li`: rows sit in a `ul`.
 */
export function ListRow({
  title,
  meta,
  children,
}: {
  title: ReactNode
  meta?: ReactNode
  children?: ReactNode
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 py-1">
      <span className="mr-auto min-w-0 text-title text-text break-words">{title}</span>
      {meta != null && <span className="text-meta text-text-muted">{meta}</span>}
      {children != null && (
        <span className="flex gap-4 text-meta max-wide:basis-full">{children}</span>
      )}
    </li>
  )
}
