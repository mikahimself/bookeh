import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Fragment, type ReactNode } from 'react'

import { canEditShared } from '@/access/roles'
import { getHoldings } from '@/lib/books/holdings'
import { getUserBookState } from '@/lib/books/userBookState'
import type { LocationOption } from '@/lib/copies/locations'
import type { Context } from '@/lib/payload/context'
import type { ShelfQuery } from '@/lib/shelf/query'

import { buttonClass } from '../components/Button'
import { Cover } from '../components/Cover'
import { heldBook } from '../heldBook'

import { BookDetailFrame } from './BookDetailPanel'
import { CopyNote, MoveCopy, ReceiveCopy, RemoveCopy } from './CopyLine'
import { FilterChip } from './FilterChip'
import { DetailLookUpAgain } from './LookUpAgain'
import { NotInLibrary } from './NotInLibrary'
import { ReadAndRating } from './ReadAndRating'
import { Refetch } from './Refetch'

const DOT = ' · '

/**
 * Book detail (EXPERIENCE.md, Book detail; DESIGN.md, Detail panel): the
 * header (cover beside the title, then authors, series and number, and the
 * edition line, each left out when empty), the read switch and Rating (keyed
 * by the Book, so swapping it resets them), Your copies, one line per copy
 * with its location and status, an owned copy's Move and Remove (Move only
 * when the viewer has locations, FR-32) or an ordered copy's Received
 * beside it and the copy's note under it (`CopyLine`), Genres when the Book
 * has system genres, the admin's Re-fetch on a shared Book (`Refetch`,
 * `canEditShared`) or, in its place on a private Book, Look it up again
 * (`DetailLookUpAgain`; without an ISBN a muted line pointing to Edit book),
 * and the foot with Edit. Each author, the series, each
 * genre and each copy's location is a Filter chip (`FilterChip`) that adds
 * it to the current filters; an ordered copy has no location and so no
 * chip. The one component later groups are added to; it reads the Book, the
 * viewer's copies and their read flag and rating only, never the client
 * rows, so it stays open when its row leaves the list. `locations` are the
 * page's, for Move; none when that read failed.
 * A Book the viewer does not hold is "Not in library". The content is the
 * same at every width; only the frame differs: the bottom sheet on the
 * phone, the panel beside the list from 900px (`BookDetailFrame`).
 */
export async function BookDetail({
  ctx,
  bookId,
  query,
  locations,
}: {
  ctx: Context
  bookId: number
  query: ShelfQuery
  locations: readonly LocationOption[]
}) {
  const book = await heldBook(ctx, bookId)
  if (!book) return <NotInLibrary query={query} />
  const copies = (await getHoldings(ctx, [bookId])).get(bookId)?.copies ?? []
  const state = await getUserBookState(ctx, bookId)

  const t = await getTranslations()
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
            {book.authors.length > 0 && (
              <p className="text-body text-text">
                {joined(
                  book.authors.map(({ id, name }) => (
                    <FilterChip key={id} field="author" id={id}>
                      {name}
                    </FilterChip>
                  )),
                  ', ',
                )}
              </p>
            )}
            {book.series && (
              <p className="text-body text-text">
                <FilterChip field="series" id={book.series.id}>
                  {book.series.name}
                </FilterChip>
                {book.seriesIndex !== null && ` ${book.seriesIndex}`}
              </p>
            )}
            {edition && <p className="text-meta text-text-muted">{edition}</p>}
          </div>
        </div>
        <ReadAndRating key={bookId} bookId={bookId} initial={state} />
        {/* Focus lands here when a copy's line goes or changes (`RemoveCopy`, `ReceiveCopy`, `MoveCopy`). */}
        <section tabIndex={-1} className="flex flex-col gap-2">
          <h3 className="text-heading-group text-text-muted ui-case">{t('detail.yourCopies')}</h3>
          <ul className="flex flex-col gap-4">
            {copies.map(({ copyId, location, status, note }) => (
              <li key={copyId}>
                {/* Names the line's Move, Remove, Received and Note after the copy. */}
                <div
                  role="group"
                  aria-labelledby={`copy-${copyId}`}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p id={`copy-${copyId}`} className="text-body text-text">
                      {location && (
                        <>
                          <FilterChip field="location" id={location.id}>
                            {location.name}
                          </FilterChip>
                          {DOT}
                        </>
                      )}
                      {t('answer.copy', { status })}
                    </p>
                    {status === 'owned' && (
                      <div className="flex shrink-0 gap-4">
                        {locations.length > 0 && (
                          <MoveCopy
                            copyId={copyId}
                            location={location?.id ?? null}
                            locations={locations}
                          />
                        )}
                        <RemoveCopy copyId={copyId} last={copies.length === 1} />
                      </div>
                    )}
                    {status === 'ordered' && <ReceiveCopy copyId={copyId} />}
                  </div>
                  <CopyNote copyId={copyId} note={note ?? ''} />
                </div>
              </li>
            ))}
          </ul>
        </section>
        {book.genres.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-heading-group text-text-muted ui-case">{t('detail.genres')}</h3>
            <p className="text-body text-text">
              {joined(
                book.genres.map(({ id, name }) => (
                  <FilterChip key={id} field="genre" id={id}>
                    {name}
                  </FilterChip>
                )),
                DOT,
              )}
            </p>
          </section>
        )}
        {book.visibility === 'shared' && book.isbn13 && canEditShared(ctx.user) && (
          <Refetch bookId={bookId} />
        )}
        {book.visibility === 'private' &&
          (book.isbn13 ? (
            <div className="flex">
              <DetailLookUpAgain bookId={bookId} />
            </div>
          ) : (
            <p className="text-meta text-text-muted">{t('detail.lookUpNeedsIsbn')}</p>
          ))}
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

/** `items` with `separator` as plain text between each two. */
function joined(items: ReactNode[], separator: string): ReactNode[] {
  return items.map((item, index) => (
    <Fragment key={index}>
      {index > 0 && separator}
      {item}
    </Fragment>
  ))
}
