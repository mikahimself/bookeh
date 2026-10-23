import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { getHoldings } from '@/lib/books/holdings'
import { getUserBookState } from '@/lib/books/userBookState'
import type { Context } from '@/lib/payload/context'
import type { ShelfQuery } from '@/lib/shelf/query'

import { buttonClass } from '../components/Button'
import { Cover } from '../components/Cover'
import { heldBook } from '../heldBook'

import { BookDetailFrame } from './BookDetailPanel'
import { NotInLibrary } from './NotInLibrary'
import { ReadAndRating } from './ReadAndRating'

/**
 * Book detail (EXPERIENCE.md, Book detail; DESIGN.md, Detail panel): the
 * header (cover beside the title, then authors, series and number, and the
 * edition line, each left out when empty), the read switch and Rating
 * (keyed by the Book, so swapping it resets them), Your copies, one line per
 * copy with its location and status, and the foot with Edit. The one
 * component later groups are added to; it reads the Book, the viewer's copies
 * and their read flag and rating only, never the client rows, so it stays
 * open when its row leaves the list.
 * A Book the viewer does not hold is "Not in library". The content is the
 * same at every width; only the frame differs: the bottom sheet on the
 * phone, the panel beside the list from 900px (`BookDetailFrame`).
 */
export async function BookDetail({
  ctx,
  bookId,
  query,
}: {
  ctx: Context
  bookId: number
  query: ShelfQuery
}) {
  const book = await heldBook(ctx, bookId)
  if (!book) return <NotInLibrary query={query} />
  const copies = (await getHoldings(ctx, [bookId])).get(bookId)?.copies ?? []
  const state = await getUserBookState(ctx, bookId)

  const t = await getTranslations()
  const authors = book.authors.map(({ name }) => name).join(', ')
  const series =
    book.series === null
      ? null
      : book.seriesIndex === null
        ? book.series.name
        : t('detail.series', { name: book.series.name, index: book.seriesIndex })
  // The stored language code until languages are named (Story 5.14).
  const edition = [
    book.publisher,
    book.year === null ? null : String(book.year),
    book.pages === null ? null : t('answer.pages', { pages: book.pages }),
    book.language,
  ]
    .filter((part) => part)
    .join(' · ')

  return (
    <BookDetailFrame label={book.title} query={query} bookId={bookId}>
      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-4">
          <div className="w-cover-detail shrink-0">
            <Cover src={book.coverUrl} title={book.title} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-heading-detail break-words text-text">{book.title}</h2>
            {authors && <p className="text-body text-text">{authors}</p>}
            {series && <p className="text-body text-text">{series}</p>}
            {edition && <p className="text-meta text-text-muted">{edition}</p>}
          </div>
        </div>
        <ReadAndRating key={bookId} bookId={bookId} initial={state} />
        <section className="flex flex-col gap-2">
          <h3 className="text-heading-group text-text-muted ui-case">{t('detail.yourCopies')}</h3>
          <ul className="flex flex-col gap-1">
            {copies.map(({ copyId, location, status }) => (
              <li key={copyId} className="text-body text-text">
                {[location?.name, t('answer.copy', { status })].filter((part) => part).join(' · ')}
              </li>
            ))}
          </ul>
        </section>
        <div className="flex gap-2">
          <Link
            href={`/books/${bookId}/edit`}
            transitionTypes={['task-open']}
            className={`${buttonClass('secondary')} inline-flex items-center justify-center`}
          >
            {t('detail.edit')}
          </Link>
        </div>
      </div>
    </BookDetailFrame>
  )
}
