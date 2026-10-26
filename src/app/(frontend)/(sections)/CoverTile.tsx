import Link from 'next/link'

import type { ShelfRow } from '@/lib/shelf/query'

import { Checkbox } from '../components/Checkbox'
import { Cover } from '../components/Cover'
import { markerSlotClass } from '../components/ui/classes'
import type { DevicePrefs } from '../prefs'

import type { RowSelect } from './BookRow'

/** DESIGN.md, Collection density: the title's size; at s both lines are `label`. */
const TITLE: Record<DevicePrefs['size'], string> = {
  s: 'text-label',
  m: 'text-meta',
  l: 'text-meta',
}

/**
 * DESIGN.md, Cover tile: the cover at 2:3 across the column, then the title
 * and the authors in muted label, each on one truncated line. A placeholder
 * cover carries the title alone, so the authors are said once. An ordered
 * copy's cover wears the airmail band across its top-left corner
 * (`airmail-band`); no word. A lent owned copy has the lent marker before its
 * title and "Lent · {person}" (`lent`) after the authors. Hook-free, like `BookRow`, and like it a link to
 * `href`; `open` puts the selection bar along the bottom edge of the cover.
 * In select mode (`select`) the tile is one `<label>` with the checkbox
 * before the title instead, so a tap anywhere ticks it and opens nothing.
 */
export function CoverTile({
  row: { copy, book },
  size,
  lent,
  href,
  replace,
  open,
  select,
}: {
  row: ShelfRow
  size: DevicePrefs['size']
  lent: (person: string) => string
  href: string
  replace: boolean
  open: boolean
  select?: RowSelect
}) {
  const authors = book.authors.map((author) => author.name).join(', ')
  const lentTo = copy.status === 'owned' && copy.loan !== null ? copy.loan.person.name : null

  const coverClass = [
    copy.status === 'ordered' ? 'airmail-band' : '',
    open
      ? 'relative after:absolute after:inset-x-0 after:bottom-0 after:h-stroke-selection after:bg-accent'
      : '',
  ]
    .filter(Boolean)
    .join(' ')
  const cover = (
    <div className={coverClass || undefined}>
      <Cover src={book.coverUrl} title={book.title} language={book.language} />
    </div>
  )
  const lines = (
    <>
      {lentTo !== null ? (
        <p className={`flex items-center gap-2 pt-1 text-text ${TITLE[size]}`}>
          <span aria-hidden="true" className={`${markerSlotClass} bg-accent`} />
          <span className="min-w-0 truncate">{book.title}</span>
        </p>
      ) : (
        <p className={`truncate pt-1 text-text ${TITLE[size]}`}>{book.title}</p>
      )}
      {authors && <p className="truncate text-label text-text-muted">{authors}</p>}
      {lentTo !== null && <p className="truncate text-label text-text">{lent(lentTo)}</p>}
    </>
  )

  return (
    <li className="min-w-0">
      {select ? (
        <label className="flex min-w-0 cursor-pointer flex-col">
          {cover}
          <div className="flex min-w-0 items-start gap-2">
            <span className="pt-1">
              <Checkbox checked={select.ticked} onChange={select.onToggle} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">{lines}</div>
          </div>
        </label>
      ) : (
        <Link
          href={href}
          replace={replace}
          scroll={false}
          prefetch={false}
          aria-current={open ? 'true' : undefined}
          className="flex min-w-0 flex-col"
        >
          {cover}
          {lines}
        </Link>
      )}
    </li>
  )
}
