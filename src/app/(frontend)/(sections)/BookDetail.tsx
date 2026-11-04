import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'

import { canEditShared } from '@/access/roles'
import { getHoldings } from '@/lib/books/holdings'
import { getUserBookState } from '@/lib/books/userBookState'
import type { LocationOption } from '@/lib/copies/locations'
import { logger } from '@/lib/errors'
import { returnedLoans } from '@/lib/loans/loans'
import type { Context } from '@/lib/payload/context'
import { lendingPeople } from '@/lib/people/people'

import { AddToWishlist } from '../components/AddToWishlist'
import { buttonClass } from '../components/Button'
import { markerSlotClass } from '../components/ui/classes'
import { viewerWishlists } from '../components/viewerWishlists'
import { heldBook } from '../heldBook'
import { isLent } from '../isLent'

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
 * has system genres, then a nonblank effective Description in full as plain
 * text with preserved line breaks, the admin's Re-fetch on a shared Book (`Refetch`,
 * `canEditShared`) or, in its place on a private Book, Look it up again
 * (`DetailLookUpAgain`; without an ISBN a muted line pointing to Edit book),
 * and the foot with Edit and Add to wishlist, both secondary, no primary
 * (`AddToWishlist`, staying open after the save; a failed read of the
 * viewer's wishlists leaves its picker with New list alone). Each genre and
 * each copy's location, like the header's authors and series, is a Filter
 * chip (`FilterChip`) that adds it to the current filters; an ordered copy
 * has no location and so no chip. The one component later groups are added
 * to; it reads the Book, the viewer's copies and entries and their read flag
 * and rating only, never the client rows, so it stays open when its row
 * leaves the list. `locations` are the page's, for Move; none when that
 * read failed.
 * The viewer's People (`lendingPeople()`) are read only when some copy can
 * be lent; the picker reads today itself; a failed People read leaves it with New person
 * alone. Lent before follows Your copies when the viewer's copies have
 * returned loans (`returnedLoans(ctx, bookId)`), newest first as
 * "{person} · {from} to {to}"; a failed read leaves it out. On wishlists
 * follows it (FR-26): the viewer's open entries from the same holdings read,
 * oldest first, each "{list} · for {person}" or the list's name alone for
 * the viewer's own, no links or chips; absent with no entries. A Book held
 * only through entries has no Your copies group. Remove's `last` counts
 * entries: removing the only copy while entries remain keeps Book detail
 * open, with focus on On wishlists (`focusAfter`). A Book the
 * viewer does not hold is "Not in library". The content is the same at
 * every width; only the frame differs: the bottom sheet on the phone, the
 * panel beside the list from 900px (`BookDetailFrame`). Opened on `/` or
 * `/loans`: `back` is that section's address without `book`, where closing
 * it and "Not in library" land.
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
  // Started now, awaited at the foot: it runs alongside the reads below.
  const wishlists = viewerWishlists(ctx)
  const { copies, entries } = (await getHoldings(ctx, [bookId])).get(bookId) ?? {
    copies: [],
    entries: [],
  }
  const state = await getUserBookState(ctx, bookId)
  const lendable = copies.some((copy) => copy.status === 'owned' && !isLent(copy))
  const people = lendable
    ? await lendingPeople(ctx).catch((err: unknown) => {
        logger().error({ err }, 'The People failed to load')
        return []
      })
    : []
  const history = await returnedLoans(ctx, bookId).catch((err: unknown) => {
    logger().error({ err }, 'The loan history failed to load')
    return []
  })

  const lists = await wishlists

  const t = await getTranslations()
  const format = await getFormatter()
  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: 'medium' })

  // Focus lands here when the only copy goes while entries keep Book detail open.
  const onWishlistsId = `on-wishlists-${bookId}`

  return (
    <BookDetailFrame label={book.title} back={back} openId={bookId}>
      <div className="flex flex-col gap-6">
        <BookHeader book={book} />
        <ReadAndRating key={bookId} bookId={bookId} initial={state} />
        {/* Focus lands here when a copy's line goes or changes (`RemoveCopy`, `ReceiveCopy`, `MoveCopy`, `LendCopy`, `ReturnLoan`). */}
        {copies.length > 0 && (
          <section tabIndex={-1} className="flex flex-col gap-2">
            <h3 className="text-heading-group text-text-muted ui-case">{t('detail.yourCopies')}</h3>
            <ul className="flex flex-col gap-4">
              {copies.map((copy) => (
                <li key={copy.copyId}>
                  {/* Names the line's Links and Note after the copy. */}
                  <div
                    role="group"
                    aria-labelledby={`copy-${copy.copyId}`}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p id={`copy-${copy.copyId}`} className="text-body text-text">
                        {copy.location && (
                          <>
                            <FilterChip field="location" id={copy.location.id}>
                              {copy.location.name}
                            </FilterChip>
                            {DOT}
                          </>
                        )}
                        {t('answer.copy', { status: copy.status })}
                      </p>
                      {isLent(copy) && <ReturnLoan loanId={copy.loan.loanId} />}
                      {copy.status === 'owned' && !isLent(copy) && (
                        <div className="flex shrink-0 gap-4">
                          <LendCopy
                            copyId={copy.copyId}
                            context={
                              copy.location
                                ? `${book.title}${DOT}${copy.location.name}`
                                : book.title
                            }
                            people={people}
                          />
                          {locations.length > 0 && (
                            <MoveCopy
                              copyId={copy.copyId}
                              location={copy.location?.id ?? null}
                              locations={locations}
                            />
                          )}
                          <RemoveCopy
                            copyId={copy.copyId}
                            last={copies.length === 1 && entries.length === 0}
                            {...(copies.length === 1 &&
                              entries.length > 0 && { focusAfter: onWishlistsId })}
                          />
                        </div>
                      )}
                      {copy.status === 'ordered' && <ReceiveCopy copyId={copy.copyId} />}
                    </div>
                    {isLent(copy) && (
                      <p className="flex items-center gap-2 text-body text-text">
                        <span aria-hidden="true" className={`${markerSlotClass} bg-accent`} />
                        {t('loans.lentTo', {
                          person: copy.loan.person.name,
                          date: day(copy.loan.since),
                        })}
                      </p>
                    )}
                    <CopyNote copyId={copy.copyId} note={copy.note ?? ''} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
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
        {entries.length > 0 && (
          <section id={onWishlistsId} tabIndex={-1} className="flex flex-col gap-2">
            <h3 className="text-heading-group text-text-muted ui-case">
              {t('detail.onWishlists')}
            </h3>
            <ul className="flex flex-col gap-1">
              {entries.map(({ entryId, wishlist, forPerson }) => (
                <li key={entryId} className="text-body text-text">
                  {forPerson
                    ? t('wishlists.entryFor', { list: wishlist.name, person: forPerson.name })
                    : wishlist.name}
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
        {book.description?.trim() && (
          <section className="flex min-w-0 flex-col gap-2">
            <h3 className="text-heading-group text-text-muted ui-case">
              {t('detail.description')}
            </h3>
            <p className="text-body whitespace-pre-wrap text-text wrap-anywhere">
              {book.description}
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
