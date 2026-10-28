import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'

import { canEditShared } from '@/access/roles'
import { getHoldings } from '@/lib/books/holdings'
import { getUserBookState } from '@/lib/books/userBookState'
import type { LocationOption } from '@/lib/copies/locations'
import { logger } from '@/lib/errors'
import { helsinkiToday } from '@/lib/loans/dates'
import { returnedLoans } from '@/lib/loans/loans'
import type { Context } from '@/lib/payload/context'
import { lendingPeople } from '@/lib/people/people'
import { listWishlists } from '@/lib/wishlists/wishlists'

import { buttonClass } from '../components/Button'
import { markerSlotClass } from '../components/ui/classes'
import { heldBook } from '../heldBook'
import { AddToWishlist } from '../scan/AddToWishlist'

import { BookDetailFrame } from './BookDetailPanel'
import { BookHeader, joined } from './BookHeader'
import { CopyNote, LendCopy, MoveCopy, ReceiveCopy, RemoveCopy, ReturnLoan } from './CopyLine'
import { FilterChip } from './FilterChip'
import { DetailLookUpAgain } from './LookUpAgain'
import { NotInLibrary } from './NotInLibrary'
import { ReadAndRating } from './ReadAndRating'
import { Refetch } from './Refetch'

const DOT = ' · '

/**
 * Book detail (EXPERIENCE.md, Book detail; DESIGN.md, Detail panel): the
 * header (`BookHeader`), the read switch and Rating (keyed
 * by the Book, so swapping it resets them), Your copies, one line per copy
 * with its location and status and the copy's note under it (`CopyLine`):
 * an owned copy's Lend, Move and Remove (Move only when the viewer has
 * locations, FR-32); a lent one's marker with "Lent to {person} since
 * {date}" under its line and Returned only (FR-35, FR-36); an ordered
 * copy's Received, whatever its loans. Genres when the Book
 * has system genres, the admin's Re-fetch on a shared Book (`Refetch`,
 * `canEditShared`) or, in its place on a private Book, Look it up again
 * (`DetailLookUpAgain`; without an ISBN a muted line pointing to Edit book),
 * and the foot with Edit and Add to wishlist, both secondary, no primary
 * (`AddToWishlist`, staying open after the save; a failed read of the
 * viewer's wishlists leaves its picker with New list alone). Each genre and each copy's location, like the
 * header's authors and series, is a Filter chip (`FilterChip`) that adds
 * it to the current filters; an ordered copy has no location and so no
 * chip. The one component later groups are added to; it reads the Book, the
 * viewer's copies and their read flag and rating only, never the client
 * rows, so it stays open when its row leaves the list. `locations` are the
 * page's, for Move; none when that read failed. The viewer's People
 * (`lendingPeople()`) and today are read only when some copy can be lent; a
 * failed People read leaves the picker with New person alone. Lent before
 * follows Your copies when the viewer's copies have returned loans
 * (`returnedLoans(ctx, bookId)`), newest first as "{person} · {from} to
 * {to}"; a failed read leaves it out.
 * A Book the viewer does not hold is "Not in library". The content is the
 * same at every width; only the frame differs: the bottom sheet on the
 * phone, the panel beside the list from 900px (`BookDetailFrame`). Opened on
 * `/` or `/loans`: `back` is that section's address without `book`, where
 * closing it and "Not in library" land.
 */
export async function BookDetail({
  ctx,
  bookId,
  back,
  locations,
}: {
  ctx: Context
  bookId: number
  back: string
  locations: readonly LocationOption[]
}) {
  const book = await heldBook(ctx, bookId)
  if (!book) return <NotInLibrary back={back} />
  const copies = (await getHoldings(ctx, [bookId])).get(bookId)?.copies ?? []
  const state = await getUserBookState(ctx, bookId)
  const lendable = copies.some(({ status, loan }) => status === 'owned' && loan === null)
  const people = lendable
    ? await lendingPeople(ctx).catch((err: unknown) => {
        logger().error({ err }, 'The People failed to load')
        return []
      })
    : []
  const today = lendable ? helsinkiToday() : ''
  const history = await returnedLoans(ctx, bookId).catch((err: unknown) => {
    logger().error({ err }, 'The loan history failed to load')
    return []
  })

  const lists = await listWishlists(ctx).catch((err: unknown) => {
    logger().error({ err }, 'The wishlists failed to load')
    return []
  })

  const t = await getTranslations()
  const format = await getFormatter()
  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: 'medium' })

  return (
    <BookDetailFrame label={book.title} back={back} openId={bookId}>
      <div className="flex flex-col gap-6">
        <BookHeader book={book} />
        <ReadAndRating key={bookId} bookId={bookId} initial={state} />
        {/* Focus lands here when a copy's line goes or changes (`RemoveCopy`, `ReceiveCopy`, `MoveCopy`, `LendCopy`, `ReturnLoan`). */}
        <section tabIndex={-1} className="flex flex-col gap-2">
          <h3 className="text-heading-group text-text-muted ui-case">{t('detail.yourCopies')}</h3>
          <ul className="flex flex-col gap-4">
            {copies.map(({ copyId, location, status, note, loan }) => (
              <li key={copyId}>
                {/* Names the line's Links and Note after the copy. */}
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
                    {status === 'owned' && loan !== null && <ReturnLoan loanId={loan.loanId} />}
                    {status === 'owned' && loan === null && (
                      <div className="flex shrink-0 gap-4">
                        <LendCopy
                          copyId={copyId}
                          context={location ? `${book.title}${DOT}${location.name}` : book.title}
                          people={people}
                          today={today}
                        />
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
                  {status === 'owned' && loan !== null && (
                    <p className="flex items-center gap-2 text-body text-text">
                      <span aria-hidden="true" className={`${markerSlotClass} bg-accent`} />
                      {t('loans.lentTo', {
                        person: loan.person.name,
                        date: day(loan.since),
                      })}
                    </p>
                  )}
                  <CopyNote copyId={copyId} note={note ?? ''} />
                </div>
              </li>
            ))}
          </ul>
        </section>
        {history.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-heading-group text-text-muted ui-case">{t('detail.lentBefore')}</h3>
            <ul className="flex flex-col gap-1">
              {history.map(({ loanId, person, lentOn, returnedOn }) => (
                <li key={loanId} className="text-body text-text">
                  {t('loans.lentBetween', {
                    person: person.name,
                    from: day(lentOn),
                    to: day(returnedOn),
                  })}
                </li>
              ))}
            </ul>
          </section>
        )}
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
          <AddToWishlist lists={lists} title={book.title} target={{ bookId }} stay />
        </div>
      </div>
    </BookDetailFrame>
  )
}
