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
import { isPrivateBookCreator } from '@/lib/books/isPrivateBookCreator'
import { languageName } from '@/lib/books/languageName'
import { lendingPeople } from '@/lib/people/people'

import { AddToWishlist } from '../components/AddToWishlist'
import { Accordion, AccordionItem } from '../components/ui/Accordion'
import { markerSlotClass } from '../components/ui/classes'
import { viewerWishlists } from '../components/viewerWishlists'
import { heldBook } from '../heldBook'
import { isLent } from '../isLent'

import { BookDetailFrame } from './BookDetailPanel'
import type { DetailResult } from './BookDetailSlot'
import { BookHeader, joined } from './BookHeader'
import { CopyNote, CopyPurchase } from './CopyLine'
import { BookDetailActions } from './BookDetailActions'
import { FilterChip } from './FilterChip'
import { NotInLibrary } from './NotInLibrary'
import { HeaderRating, ReadAndRating, ReadingRow } from './ReadAndRating'
import { DetailTags } from './DetailTags'
import { detailsRowId, readingLine } from './readingLine'

const DOT = ' · '

/**
 * Held Book detail, shared by Collection and Loans: a reading header, five
 * independent Folding sections and the responsive action controller. Copy
 * lines keep their status, purchase Links, loan text and note; all copy
 * mutations live in BookDetailActions. Its phone bar portals into the sheet's
 * pinned footer; wide controls sit after the utilities at the panel's foot.
 *
 * Undo reseeds reading values without remounting child controllers or open
 * sections. Book-specific controller state is keyed by book id. Mutations
 * focus the stable copies row, or On wishlists after the only copy goes;
 * without entries that removal closes detail. Tag and wishlist Pickers stay
 * open through their normal refresh. Reads use holdings and the effective
 * Book, so detail remains open when its row leaves the current filtered list.
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
}): Promise<DetailResult> {
  const book = await heldBook(ctx, bookId)
  if (!book) return { kind: 'missing', content: <NotInLibrary back={back} /> }
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

  // Admins can read another creator's private Book; lookup remains creator-only.
  const ownPrivate =
    book.visibility === 'private' && book.isbn13 ? await isPrivateBookCreator(ctx, bookId) : false

  const lists = await wishlists

  const t = await getTranslations()
  const format = await getFormatter()
  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: 'medium' })

  const locale = await getLocale()

  // Focus lands on these rows: Your copies after a copy's line goes or changes
  // (including while closed), On wishlists when the only copy goes while
  // entries keep Book detail open.
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

  const header = await BookHeader({ book, children: <HeaderRating /> })
  const content = (
    <BookDetailFrame pinnedActions label={book.title} back={back} openId={bookId}>
      <Accordion key={bookId} className="flex flex-col gap-6">
        <ReadAndRating
          key={bookId}
          bookId={bookId}
          title={book.title}
          initial={state}
          header={header}
        >
          <div>
            {copies.length > 0 && (
              <AccordionItem
                value="copies"
                title={t('detail.yourCopies')}
                summary={copiesSummary}
                rowId={`your-copies-${bookId}`}
              >
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
          <DetailTags
            key={`tags-${bookId}`}
            bookId={bookId}
            initial={state.tags}
            options={tagOptions}
          />
          <BookDetailActions
            key={`actions-${bookId}`}
            bookId={bookId}
            title={book.title}
            copies={copies}
            hasEntries={entries.length > 0}
            locations={locations}
            people={people}
            utility={
              book.visibility === 'shared'
                ? book.isbn13 && canEditShared(ctx.user)
                  ? 'refetch'
                  : null
                : book.isbn13
                  ? ownPrivate
                    ? 'lookup'
                    : null
                  : 'no-isbn'
            }
          >
            <AddToWishlist lists={lists} title={book.title} target={{ bookId }} stay />
          </BookDetailActions>
        </ReadAndRating>
      </Accordion>
    </BookDetailFrame>
  )
  return { kind: 'ready', label: book.title, content }
}
