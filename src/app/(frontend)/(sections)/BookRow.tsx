import type { ShelfRow } from '@/lib/shelf/query'

import { Cover } from '../components/Cover'

/**
 * DESIGN.md, Book row at size m: a 32 × 48px cover, the title on one line,
 * then authors · year · publisher in muted meta, then the ending. One row is
 * one copy. Hook-free, so the server page and the client list share it; the
 * caller passes the words it needs.
 */
export function BookRow({ row: { copy, book }, ordered }: { row: ShelfRow; ordered: string }) {
  const meta = [book.authors.map((author) => author.name).join(', '), book.year, book.publisher]
    .filter((part) => part !== null && part !== '')
    .join(' · ')

  return (
    <li className="flex items-center gap-4 py-2">
      <div className="w-cover-row shrink-0">
        <Cover src={book.coverUrl} title={book.title} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-title text-text">{book.title}</p>
        {meta && <p className="truncate text-meta text-text-muted">{meta}</p>}
      </div>
      {copy.status === 'ordered' && (
        <span className="shrink-0 text-meta text-text-muted">{ordered}</span>
      )}
    </li>
  )
}
