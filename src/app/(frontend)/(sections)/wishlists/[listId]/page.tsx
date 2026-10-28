import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { getEffectiveBooks, type EffectiveBook } from '@/lib/books/effectiveBook'
import { logger } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { requireUser } from '@/lib/payload/context'
import { isRowId } from '@/lib/payload/ref'
import { getWishlist, type ListEntry, type WishlistView } from '@/lib/wishlists/wishlists'

import { BackLink } from '../../../components/Link'
import { LoadFailed } from '../../LoadFailed'

import { EntryRow } from './EntryRow'
import { ListHeading } from './ListHeading'

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
 * another user's (FR-48), redirects to `/wishlists`. A failed read, the Back
 * link and Load failed. Books come from `getEffectiveBooks()` and are never
 * sorted or filtered on.
 */
export default async function WishlistPage({ params }: { params: Promise<{ listId: string }> }) {
  const ctx = await requireUser()
  const { listId } = await params
  const id = /^[0-9]+$/.test(listId) ? Number(listId) : Number.NaN
  if (!isRowId(id)) redirect('/wishlists')

  const loaded = await load(ctx, id).catch((err: unknown): 'failed' => {
    logger().error({ err }, 'The wishlist failed to load')
    return 'failed'
  })
  if (loaded === null) redirect('/wishlists')

  const t = await getTranslations()

  return (
    <div className="flex flex-1 flex-col px-page-margin-phone wide:px-page-margin">
      <div className="flex flex-col items-start pt-2">
        <BackLink href="/wishlists">{t('sections.wishlists')}</BackLink>
      </div>
      {loaded === 'failed' ? (
        <LoadFailed />
      ) : (
        <section>
          <ListHeading id={loaded.list.id} name={loaded.list.name} count={loaded.rows.length} />
          {loaded.rows.length === 0 ? (
            <p className="py-4 text-heading-group">{t('wishlists.emptyList')}</p>
          ) : (
            <ul>
              {loaded.rows.map(({ entry, book }) => (
                <EntryRow
                  key={entry.entryId}
                  book={book}
                  forLine={
                    entry.forPerson === null
                      ? null
                      : t('wishlists.forPerson', { person: entry.forPerson.name })
                  }
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
