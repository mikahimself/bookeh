import Link from 'next/link'

import type { ShelfRow } from '@/lib/shelf/query'

import { Cover } from '../components/Cover'
import type { DevicePrefs } from '../prefs'

/** DESIGN.md, Collection density: the title's size; at s both lines are `label`. */
const TITLE: Record<DevicePrefs['size'], string> = {
  s: 'text-label',
  m: 'text-meta',
  l: 'text-meta',
}

/**
 * DESIGN.md, Cover tile: the cover at 2:3 across the column, then the title
 * and the authors in muted label, each on one truncated line. Hook-free, like
 * `BookRow`, and like it a link to `href`; `open` puts the selection bar
 * along the bottom edge of the cover.
 */
export function CoverTile({
  row: { book },
  size,
  href,
  replace,
  open,
}: {
  row: ShelfRow
  size: DevicePrefs['size']
  href: string
  replace: boolean
  open: boolean
}) {
  const authors = book.authors.map((author) => author.name).join(', ')

  return (
    <li className="min-w-0">
      <Link
        href={href}
        replace={replace}
        scroll={false}
        prefetch={false}
        aria-current={open ? 'true' : undefined}
        className="flex min-w-0 flex-col"
      >
        <div
          className={
            open
              ? 'relative after:absolute after:inset-x-0 after:bottom-0 after:h-stroke-selection after:bg-accent'
              : undefined
          }
        >
          <Cover src={book.coverUrl} title={book.title} />
        </div>
        <p className={`truncate pt-1 text-text ${TITLE[size]}`}>{book.title}</p>
        {authors && <p className="truncate text-label text-text-muted">{authors}</p>}
      </Link>
    </li>
  )
}
