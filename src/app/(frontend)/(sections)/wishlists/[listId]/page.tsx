import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { getEffectiveBooks, type EffectiveBook, type Named } from '@/lib/books/effectiveBook'
import { logger } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { requireUser } from '@/lib/payload/context'
import { isRowId } from '@/lib/payload/ref'
import { personUse } from '@/lib/people/people'
import { getWishlist, type ListEntry, type WishlistView } from '@/lib/wishlists/wishlists'

import { BackLink } from '../../../components/Link'
import { LoadFailed } from '../../LoadFailed'
import { RefreshOnUndo } from '../../RefreshOnUndo'

import { EntryDetail } from './EntryDetail'
import { EntryRow } from './EntryRow'
import { ListHeading } from './ListHeading'
import { NotOnList } from './NotOnList'

type Loaded = { list: WishlistView; rows: { entry: ListEntry; book: EffectiveBook }[] }

/**
 * The list with its open entries in `getWishlist()` order and their Books
 * from one read; an entry whose Book the viewer can no longer read is left
 * out. `null` when the list is not the viewer's.
 */
async function load(ctx: Context, id: number): Promise<Loaded | null> {
  const list = await getWishlist(ctx, id)
  if (list === null) return null
  const books = await getEffectiveBooks(ctx, [
    ...new Set(list.entries.map((entry) => entry.bookId)),
  ])
  return {
    list,
    rows: list.entries.flatMap((entry) => {
      const book = books.get(entry.bookId)
      return book ? [{ entry, book }] : []
    }),
  }
}

/**
 * One wishlist (EXPERIENCE.md, Wishlists and States; FR-38, FR-39): a Back
 * link to the Wishlists section, the list's name as typed as the screen
 * heading (the headings row steps aside below a section root), "{n} books"
 * with Rename and Delete (`ListHeading`), then one row per open entry, newest
 * first, with "For {person}" when it has a recipient; "Nothing on this list."
 * with none. A `listId` that is not a row id, or a list that is gone or
 * another user's (FR-48), redirects to `/wishlists`. A failed read shows the
 * Back link and Load failed. Books come from `getEffectiveBooks()` and are never
 * sorted or filtered on. Each row links to `?entry=<entryId>` on this list.
 *
 * With `?entry=` naming one of the loaded rows (EXPERIENCE.md, Wishlists →
 * Entry opened; FR-38, UX-DR49), that entry opens (`EntryDetail`) beside the
 * list from 900px and as the sheet on the phone, closing back to the list,
 * with the viewer's People by name (`personUse()`; the entry's recipient
 * alone when that read fails) for its "For". Its Bought, Ordered and Remove
 * close the layer onto a freshly rendered list without the entry; with the
 * list loaded, `RefreshOnUndo` re-renders it after a toast Undo, so an undone
 * Bought or Ordered brings the entry back. The match is by entry id, never
 * by Book, so one Book twice opens each entry as itself. An `entry` that names no loaded row (not
 * digits, closed, removed, another list's, another user's, Book unreadable)
 * shows the list alone and "Not on this list" (`NotOnList`; EXPERIENCE.md,
 * States → Entry gone). A failed read ignores `entry`.
 */
export default async function WishlistPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireUser()
  const { listId } = await params
  const id = /^[0-9]+$/.test(listId) ? Number(listId) : Number.NaN
  if (!isRowId(id)) redirect('/wishlists')

  const loaded = await load(ctx, id).catch((err: unknown): 'failed' => {
    logger().error({ err }, 'The wishlist failed to load')
    return 'failed'
  })
  if (loaded === null) redirect('/wishlists')

  const { entry } = await searchParams
  const back = `/wishlists/${id}`
  // The open row; `null` when `entry` names none, `undefined` without one or after a failed read.
  const opened =
    loaded === 'failed' || entry === undefined
      ? undefined
      : typeof entry === 'string' && /^[0-9]+$/.test(entry)
        ? (loaded.rows.find((row) => row.entry.entryId === Number(entry)) ?? null)
        : null
  const people: Named[] = opened
    ? await personUse(ctx)
        .then((rows) => rows.map(({ id: personId, name }) => ({ id: personId, name })))
        .catch((err: unknown): Named[] => {
          logger().error({ err }, 'The People failed to load')
          return opened.entry.forPerson ? [opened.entry.forPerson] : []
        })
    : []

  const t = await getTranslations()

  return (
    <div className="flex flex-1 flex-col px-page-margin-phone wide:px-page-margin">
      <div className="flex flex-col items-start pt-2">
        <BackLink href="/wishlists">{t('sections.wishlists')}</BackLink>
      </div>
      {loaded === 'failed' ? (
        <LoadFailed />
      ) : (
        <div className="wide:flex wide:flex-1 wide:gap-6">
          <RefreshOnUndo />
          <section tabIndex={-1} className="min-w-0 flex-1">
            <ListHeading id={loaded.list.id} name={loaded.list.name} count={loaded.rows.length} />
            {loaded.rows.length === 0 ? (
              <p className="py-4 text-heading-group">{t('wishlists.emptyList')}</p>
            ) : (
              <ul>
                {loaded.rows.map(({ entry: row, book }) => (
                  <EntryRow
                    key={row.entryId}
                    book={book}
                    forLine={
                      row.forPerson === null
                        ? null
                        : t('wishlists.forPerson', { person: row.forPerson.name })
                    }
                    href={`${back}?entry=${row.entryId}`}
                    replace={Boolean(opened)}
                    open={opened?.entry.entryId === row.entryId}
                  />
                ))}
              </ul>
            )}
          </section>
          {opened && (
            <EntryDetail
              listId={id}
              listName={loaded.list.name}
              entry={opened.entry}
              book={opened.book}
              people={people}
            />
          )}
          {opened === null && <NotOnList back={back} />}
        </div>
      )}
    </div>
  )
}
