import Link from 'next/link'

import type { EffectiveBook } from '@/lib/books/effectiveBook'

import { Cover } from '../../components/Cover'

/**
 * A row of the Loans section (EXPERIENCE.md, Loans; DESIGN.md, Book row at
 * m): the cover, the title in `title`, the authors when there are any, then
 * `line`, "{person} · since {date}", both muted. One row is one loan. The
 * whole row is a link to `href`, its Book's detail on `/loans`, replacing
 * while a Book is open; `open` marks it with the selection bar. Hook-free and
 * server-rendered; tap-high on the phone through the cover's height.
 */
export function LoanRow({
  book,
  line,
  href,
  replace,
  open,
}: {
  book: EffectiveBook
  line: string
  href: string
  replace: boolean
  open: boolean
}) {
  const authors = book.authors.map((author) => author.name).join(', ')
  return (
    <li className={open ? 'selection-bar' : undefined}>
      <Link
        href={href}
        replace={replace}
        scroll={false}
        prefetch={false}
        aria-current={open ? 'true' : undefined}
        className="flex items-center gap-4 py-2"
      >
        <div className="w-cover-row shrink-0">
          <Cover src={book.coverUrl} title={book.title} language={book.language} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-title text-text">{book.title}</p>
          {authors && <p className="min-w-0 truncate text-meta text-text-muted">{authors}</p>}
          <p className="min-w-0 truncate text-meta text-text-muted">{line}</p>
        </div>
      </Link>
    </li>
  )
}
