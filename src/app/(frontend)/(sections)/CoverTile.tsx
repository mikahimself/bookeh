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
 * `BookRow`.
 */
export function CoverTile({ row: { book }, size }: { row: ShelfRow; size: DevicePrefs['size'] }) {
  const authors = book.authors.map((author) => author.name).join(', ')

  return (
    <li className="flex min-w-0 flex-col">
      <Cover src={book.coverUrl} title={book.title} />
      <p className={`truncate pt-1 text-text ${TITLE[size]}`}>{book.title}</p>
      {authors && <p className="truncate text-label text-text-muted">{authors}</p>}
    </li>
  )
}
