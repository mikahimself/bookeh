import Link from 'next/link'

import type { ShelfRow } from '@/lib/shelf/query'

import { Checkbox } from '../components/Checkbox'
import { Cover } from '../components/Cover'
import type { DevicePrefs } from '../prefs'

type Size = DevicePrefs['size']

/** Select mode on a row or tile: whether the copy is ticked, and its toggle. */
export type RowSelect = { ticked: boolean; onToggle: () => void }

/** DESIGN.md, Collection density: the row's padding and cover width per size. */
const ROW: Record<Size, { row: string; cover: string }> = {
  s: { row: 'py-row-pad-s', cover: 'w-cover-row-s' },
  m: { row: 'py-2', cover: 'w-cover-row' },
  l: { row: 'py-row-pad-l', cover: 'w-cover-row-l' },
}

const joined = (parts: (string | number | null)[]) =>
  parts.filter((part) => part !== null && part !== '').join(' · ')

/**
 * DESIGN.md, Book row and Collection density: the cover, the title in
 * `title`, then muted meta, then the ending. At l the authors and year ·
 * publisher are two lines; at m one; at s the meta follows the title on its
 * one line, and a placeholder cover is an empty box. At every size an ordered
 * copy's row ends with "Ordered" and an owned copy's with its location's name,
 * truncated when long. Nothing ends an owned row without a location, so a
 * user with no locations never sees a location there (FR-32). One row is one copy.
 * Hook-free, so the server page and the client list share it; the caller
 * passes the words it needs. The whole row is a link to `href`, its Book's
 * detail; `open` marks it with the selection bar. In select mode (`select`)
 * the row is one `<label>` with the checkbox before the cover instead, so a
 * tap anywhere ticks it and opens nothing; at least tap-high on the phone.
 */
export function BookRow({
  row: { copy, book },
  size,
  ordered,
  href,
  replace,
  open,
  select,
}: {
  row: ShelfRow
  size: Size
  ordered: string
  href: string
  replace: boolean
  open: boolean
  select?: RowSelect
}) {
  const authors = book.authors.map((author) => author.name).join(', ')
  const lines =
    size === 'l'
      ? [authors, joined([book.year, book.publisher])]
      : [joined([authors, book.year, book.publisher])]
  const meta = lines.filter((line) => line !== '')
  const ending = copy.status === 'ordered' ? ordered : copy.location?.name

  const content = (
    <>
      <div className={`${ROW[size].cover} shrink-0`}>
        <Cover src={book.coverUrl} title={size === 's' ? '' : book.title} />
      </div>
      <div className={`flex min-w-0 flex-1 ${size === 's' ? 'items-baseline gap-2' : 'flex-col'}`}>
        <p className={`truncate text-title text-text${size === 's' ? ' max-w-full shrink-0' : ''}`}>
          {book.title}
        </p>
        {meta.map((line, i) => (
          <p key={i} className="min-w-0 truncate text-meta text-text-muted">
            {line}
          </p>
        ))}
      </div>
      {ending !== undefined && (
        <span className="max-w-1/3 shrink-0 truncate text-meta text-text-muted">{ending}</span>
      )}
    </>
  )
  const layout = `flex items-center gap-4 ${ROW[size].row}`

  return (
    <li className={open ? 'selection-bar' : undefined}>
      {select ? (
        <label className={`${layout} cursor-pointer max-wide:min-h-tap`}>
          <Checkbox checked={select.ticked} onChange={select.onToggle} />
          {content}
        </label>
      ) : (
        <Link
          href={href}
          replace={replace}
          scroll={false}
          prefetch={false}
          aria-current={open ? 'true' : undefined}
          className={layout}
        >
          {content}
        </Link>
      )}
    </li>
  )
}
