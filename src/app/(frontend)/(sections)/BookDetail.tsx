import Link from 'next/link'
import { getFormatter, getLocale, getTranslations } from 'next-intl/server'

import { helsinkiToday } from '@/fields/readingDates'
import { tagUse } from '@/lib/tags/tags'
import { canEditShared } from '@/access/roles'
import { getHoldings } from '@/lib/books/holdings'
import { getUserBookState } from '@/lib/books/userBookState'
import type { LocationOption } from '@/lib/copies/locations'
import { logger } from '@/lib/errors'
import { returnedLoans } from '@/lib/loans/loans'
import type { Context } from '@/lib/payload/context'
import { languageName } from '@/lib/books/languageName'
import { lendingPeople } from '@/lib/people/people'

import { AddToWishlist } from '../components/AddToWishlist'
import { buttonClass } from '../components/Button'
import { Accordion, AccordionItem } from '../components/ui/Accordion'
import { markerSlotClass } from '../components/ui/classes'
import { viewerWishlists } from '../components/viewerWishlists'
import { heldBook } from '../heldBook'
import { isLent } from '../isLent'

import { BookDetailFrame } from './BookDetailPanel'
import { BookHeader, joined } from './BookHeader'
import {
  CopyNote,
  CopyPurchase,
  LendCopy,
  MoveCopy,
  ReceiveCopy,
  RemoveCopy,
  ReturnLoan,
} from './CopyLine'
import { FilterChip } from './FilterChip'
import { DetailLookUpAgain } from './LookUpAgain'
import { NotInLibrary } from './NotInLibrary'
import { HeaderRating, ReadAndRating, ReadingRow } from './ReadAndRating'
import { DetailTags } from './DetailTags'
import { detailsRowId, readingLine } from './readingLine'
import { Refetch } from './Refetch'

const DOT = ' · '

/**
 * Book detail (EXPERIENCE.md, Book detail; DESIGN.md, Detail panel and
 * Folding section): the header (`BookHeader`, with the Rating once read) and
 * the reading control under it (`ReadAndRating`, keyed by the Book, so
 * swapping it resets them and the Rating), then five Folding sections in an
 * `Accordion`, all closed on every open and nothing remembered, one absent
 * when empty. The Accordion sits above `ReadAndRating`'s group, so a toast
 * Undo's remount of the group keeps them open.
 *
 * Your copies (summary: the one copy's location, "Ordered" or "Lent ·
 * {person}", else "{n} copies"): one line per copy with its location and
 * status, the muted "Acquired {date} · €{price}" line under it
 * (`CopyPurchase`, FR-55) and the copy's note (`CopyLine`): an owned copy's
 * Lend, Move and Remove (Move only when the viewer has locations, FR-32); a
 * lent one's marker with "Lent to {person} since {date}" under its line and
 * Returned only (FR-35, FR-36); an ordered copy's Received, whatever its
 * loans. Each copy's line settling focuses the section's row
 * (`focusSectionRow`). Description & details: a nonblank effective
 * Description in full as plain text with preserved line breaks, then value
 * rows (Reading, Publisher, Published, ISBN, Pages, Language), empty ones
 * left out; the Reading row (`ReadingRow`) is the dates line, present while
 * the Book is not unread, so a Book with only that has the section. Genres,
 * themes & tags: the nonempty system and private classification groups. Each
 * classification and each copy's location, like the header's authors and
 * series, is a Filter chip (`FilterChip`) that adds it to the current
 * filters; an ordered copy has no location and so no chip. Lent before
 * follows when the viewer's copies have returned loans
 * (`returnedLoans(ctx, bookId)`), newest first as "{person} · {from} to
 * {to}"; a failed read leaves it out. On wishlists follows (FR-26): the
 * viewer's open entries from the same holdings read, oldest first, each
 * "{list} · for {person}" or the list's name alone for the viewer's own, no
 * links or chips. A Book held only through entries has no Your copies
 * section. Remove's `last` counts entries: removing the only copy while
 * entries remain keeps Book detail open, with focus on the closed On
 * wishlists row (`focusAfter`). A Book the viewer does not hold is "Not in
 * library".
 *
 * Outside the Accordion, after it: `DetailTags` (at a fixed position, so its
 * open picker survives the refresh after each tag change), the admin's
 * Re-fetch on a shared Book (`Refetch`, `canEditShared`) or, in its place on
 * a private Book, Look it up again (`DetailLookUpAgain`; without an ISBN a
 * muted line pointing to Edit book), and the foot with Edit and Add to
 * wishlist, which takes the remaining width, both secondary, no primary
 * (`AddToWishlist`, staying open after the save; a failed read of the
 * viewer's wishlists leaves its picker with New list alone). The component
 * reads the Book, the viewer's copies and entries and their read flag,
 * rating and classifications, never the client rows, so it stays open when
 * its row leaves the list. `locations` are the page's, for Move; none when
 * that read failed. The viewer's People (`lendingPeople()`) are read only
 * when some copy can be lent; the picker reads today itself; a failed People
 * read leaves it with New person alone. The content is the same at every
 * width; only the frame differs: the bottom sheet on the phone, the panel
 * beside the list from 900px (`BookDetailFrame`). Opened on `/` or `/loans`:
 * `back` is that section's address without `book`, where closing it and
 * "Not in library" land.
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
  const tagOptions = {
    tag: await tagUse(ctx, 'tag'),
    genre: await tagUse(ctx, 'genre'),
    theme: await tagUse(ctx, 'theme'),
  }
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

  const locale = await getLocale()

  // Focus lands on these rows: Your copies after a copy's line goes or changes
  // (`focusSectionRow`), On wishlists when the only copy goes while entries
  // keep Book detail open (`RemoveCopy`'s `focusAfter`).
  const onWishlistsId = `on-wishlists-${bookId}`
  const only = copies.length === 1 ? copies[0] : undefined
  const copiesSummary = only
    ? isLent(only)
      ? t('loans.lentMarker', { person: only.loan.person.name })
      : only.status === 'ordered'
        ? t('detail.ordered')
        : (only.location?.name ?? t('detail.copiesCount', { n: 1 }))
    : t('detail.copiesCount', { n: copies.length })

  const classifications = [
    {
      heading: 'genres' as const,
      chips: book.genres.map(({ id, name }) => ({ field: 'genre' as const, id, name })),
    },
    {
      heading: 'myGenres' as const,
      chips: state.tags
        .filter(({ kind }) => kind === 'genre')
        .map(({ id, name }) => ({ field: 'genre' as const, id: `tag:${id}` as const, name })),
    },
    {
      heading: 'themes' as const,
      chips: [...new Set(book.themes.filter((name) => name.trim()))].map((name) => ({
        field: 'theme' as const,
        id: name,
        name,
      })),
    },
    {
      heading: 'myThemes' as const,
      chips: state.tags
        .filter(({ kind }) => kind === 'theme')
        .map(({ name }) => ({ field: 'theme' as const, id: name, name })),
    },
    {
      heading: 'myTags' as const,
      chips: state.tags
        .filter(({ kind }) => kind === 'tag')
        .map(({ id, name }) => ({ field: 'tag' as const, id, name })),
    },
  ]
  const classificationCount = classifications.reduce((n, { chips }) => n + chips.length, 0)

  const detailRows = [
    { label: t('detail.publisher'), value: book.publisher?.trim() },
    { label: t('detail.published'), value: book.year?.toString() },
    { label: t('detail.isbn'), value: book.isbn13 },
    { label: t('detail.pages'), value: book.pages?.toString() },
    {
      label: t('detail.language'),
      value: book.language?.trim() && languageName(book.language.trim(), locale),
    },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value))
  const hasReading = readingLine(state, helsinkiToday()).kind !== 'none'
  const hasDescription = Boolean(book.description?.trim())
  const hasDetails = hasDescription || hasReading || detailRows.length > 0

  return (
    <BookDetailFrame label={book.title} back={back} openId={bookId}>
      <Accordion key={bookId} className="flex flex-col gap-6">
        <ReadAndRating
          key={bookId}
          bookId={bookId}
          title={book.title}
          initial={state}
          header={
            <BookHeader book={book}>
              <HeaderRating />
            </BookHeader>
          }
        >
          <div>
            {copies.length > 0 && (
              <AccordionItem value="copies" title={t('detail.yourCopies')} summary={copiesSummary}>
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
                        <CopyPurchase
                          copyId={copy.copyId}
                          status={copy.status}
                          acquiredAt={copy.acquiredAt}
                          price={copy.price}
                          title={book.title}
                        />
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
              </AccordionItem>
            )}
            {hasDetails && (
              <AccordionItem
                value="details"
                title={t('detail.detailsAndDescription')}
                rowId={detailsRowId(bookId)}
              >
                <div className="flex flex-col gap-4">
                  {hasDescription && (
                    <p className="text-body whitespace-pre-wrap text-text wrap-anywhere">
                      {book.description}
                    </p>
                  )}
                  {(hasReading || detailRows.length > 0) && (
                    <dl className="flex flex-col gap-2">
                      <ReadingRow />
                      {detailRows.map(({ label, value }) => (
                        <div key={label} className="flex items-baseline justify-between gap-4">
                          <dt className="text-body text-text-muted">{label}</dt>
                          <dd className="text-right text-body text-text-muted wrap-anywhere">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </AccordionItem>
            )}
            {classificationCount > 0 && (
              <AccordionItem
                value="classifications"
                title={t('detail.classifications')}
                summary={String(classificationCount)}
              >
                <div className="flex flex-col gap-4">
                  {classifications.map(
                    ({ heading, chips }) =>
                      chips.length > 0 && (
                        <section key={heading} className="flex flex-col gap-2">
                          <h3 className="text-heading-group text-text-muted ui-case">
                            {t(`detail.${heading}`)}
                          </h3>
                          <p className="text-body text-text">
                            {joined(
                              chips.map(({ field, id, name }) => (
                                <FilterChip key={id} field={field} id={id}>
                                  {name}
                                </FilterChip>
                              )),
                              DOT,
                            )}
                          </p>
                        </section>
                      ),
                  )}
                </div>
              </AccordionItem>
            )}
            {history.length > 0 && (
              <AccordionItem
                value="history"
                title={t('detail.lentBefore')}
                summary={String(history.length)}
              >
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
              </AccordionItem>
            )}
            {entries.length > 0 && (
              <AccordionItem
                value="wishlists"
                title={t('detail.onWishlists')}
                summary={String(entries.length)}
                rowId={onWishlistsId}
              >
                <ul className="flex flex-col gap-1">
                  {entries.map(({ entryId, wishlist, forPerson }) => (
                    <li key={entryId} className="text-body text-text">
                      {forPerson
                        ? t('wishlists.entryFor', { list: wishlist.name, person: forPerson.name })
                        : wishlist.name}
                    </li>
                  ))}
                </ul>
              </AccordionItem>
            )}
          </div>
        </ReadAndRating>
        <DetailTags
          key={`tags-${bookId}`}
          bookId={bookId}
          initial={state.tags}
          options={tagOptions}
        />
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
            className={`${buttonClass('secondary')} inline-flex shrink-0 items-center justify-center`}
          >
            {t('detail.edit')}
          </Link>
          <div className="flex flex-1 flex-col [&>button]:w-full">
            <AddToWishlist lists={lists} title={book.title} target={{ bookId }} stay />
          </div>
        </div>
      </Accordion>
    </BookDetailFrame>
  )
}
