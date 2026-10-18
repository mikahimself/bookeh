import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'

import type { Named } from './effectiveBook'

// Spine, Structural Seed (Shared shapes, `src/lib/books`).

/**
 * One of the viewer's copies of a Book as the surface shows it. `loan` is
 * typed now and stays `null` until the loans reader arrives (J10, Epic 6).
 */
export type CopyLine = {
  copyId: number
  status: 'owned' | 'ordered'
  location: Named | null
  note: string | null
  loan: { loanId: number; person: Named; since: string } | null
}

/**
 * An open wishlist entry of the viewer's on a Book. Typed now; filled when
 * the wishlist reader arrives (H14, Epic 7).
 */
export type EntryLine = { entryId: number; wishlist: Named; forPerson: Named | null }

/** What the viewer holds of a Book: their copies and their open entries. */
export type Holdings = { copies: CopyLine[]; entries: EntryLine[] }

const idOf = (value: number | { id: number }): number =>
  typeof value === 'object' ? value.id : value

const empty = (): Holdings => ({ copies: [], entries: [] })

/**
 * Spine, AD-9 (Lookup) and the shelf (AD-7): the one reader of what the
 * viewer holds of a Book, keyed by Book id. Every requested id is present,
 * `{ copies: [], entries: [] }` when they hold nothing of it. The Book's
 * current readability plays no part: `readableRelation` checks it at write
 * time only, and a shared Book the admin later made private still lists the
 * viewer's copies; callers take readability from `getEffectiveBooks()`. The
 * gateway's `find` on `copies` and `locations` reaches the viewer's own rows
 * alone (AD-6/AD-17, the admin included), so no `owner` condition is needed.
 * Copies are read at `depth: 0`, since a populated `book` would carry the
 * whole Book doc (`rawMetadata` for the admin, AD-9); their locations come
 * from one read of the distinct ids. Oldest copy first, ties by id (AD-7).
 * `entries` stays empty until Epic 7.
 */
export async function getHoldings(
  ctx: Context,
  bookIds: readonly number[],
): Promise<Map<number, Holdings>> {
  const result = new Map<number, Holdings>()
  if (bookIds.length === 0) return result
  for (const id of bookIds) result.set(id, empty())

  const { docs: copies } = await gateway.find(ctx, {
    collection: 'copies',
    where: { book: { in: [...bookIds] } },
    sort: ['createdAt', 'id'],
    depth: 0,
    pagination: false,
  })
  if (copies.length === 0) return result

  const locationIds = [
    ...new Set(copies.flatMap((copy) => (copy.location == null ? [] : [idOf(copy.location)]))),
  ]
  const locationById = new Map<number, Named>()
  if (locationIds.length > 0) {
    const { docs: locations } = await gateway.find(ctx, {
      collection: 'locations',
      where: { id: { in: locationIds } },
      select: { name: true },
      depth: 0,
      pagination: false,
    })
    for (const { id, name } of locations) locationById.set(id, { id, name })
  }

  for (const copy of copies) {
    const line: CopyLine = {
      copyId: copy.id,
      status: copy.status,
      location: copy.location == null ? null : (locationById.get(idOf(copy.location)) ?? null),
      // An omitted `notes` is stored as `null`; a form submitting the field
      // empty stores `''`. Both are no note here.
      note: copy.notes ? copy.notes : null,
      loan: null,
    }
    // Never missing: the `where` is `book in bookIds` and every id was seeded.
    result.get(idOf(copy.book))!.copies.push(line)
  }
  return result
}
