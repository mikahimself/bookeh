import type { EffectiveBook } from '@/lib/books/effectiveBook'

import { Cover } from '../../../components/Cover'

/**
 * A row of one wishlist (EXPERIENCE.md, Wishlists; DESIGN.md, Book row at m):
 * the cover, the title in `title`, the authors in muted `meta` when there are
 * any, and at the end, outside the text column, `forLine` ("For {person}")
 * when the entry has a recipient. One row is one open entry. Not a link yet:
 * opening an entry is 7.12. Hook-free and server-rendered.
 */
export function EntryRow({ book, forLine }: { book: EffectiveBook; forLine: string | null }) {
  const authors = book.authors.map((author) => author.name).join(', ')
  return (
    <li className="flex items-center gap-4 py-2">
      <div className="w-cover-row shrink-0">
        <Cover src={book.coverUrl} title={book.title} language={book.language} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-title text-text">{book.title}</p>
        {authors && <p className="min-w-0 truncate text-meta text-text-muted">{authors}</p>}
      </div>
      {forLine !== null && (
        <p className="min-w-0 max-w-1/2 truncate text-meta text-text-muted">{forLine}</p>
      )}
    </li>
  )
}
