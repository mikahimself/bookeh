import NextLink from 'next/link'
import type { ReactNode } from 'react'

/**
 * DESIGN.md, List row: the name in `title`, its count right in muted `meta`,
 * then the row's Links; on the phone the Links wrap to a second line. An
 * `li`: rows sit in a `ul`. Without `href` the row itself is not tappable
 * (Settings); given it, the title and count are one link filling the row
 * (a wishlist in the Wishlists section).
 */
export function ListRow({
  title,
  meta,
  href,
  children,
}: {
  title: ReactNode
  meta?: ReactNode
  href?: string
  children?: ReactNode
}) {
  const content = (
    <>
      <span className="mr-auto min-w-0 text-title text-text break-words">{title}</span>
      {meta != null && <span className="text-meta text-text-muted">{meta}</span>}
    </>
  )

  return (
    <li className="flex flex-wrap items-baseline gap-x-4 py-1">
      {href === undefined ? (
        content
      ) : (
        <NextLink
          href={href}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 max-wide:min-h-tap"
        >
          {content}
        </NextLink>
      )}
      {children != null && (
        <span className="flex gap-4 text-meta max-wide:basis-full">{children}</span>
      )}
    </li>
  )
}
