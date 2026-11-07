import { sql } from '@payloadcms/db-postgres/drizzle'

import { getEffectiveBooks } from '@/lib/books/effectiveBook'
import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'

import { readStateOf } from './effective'
import type { ReadingBook } from './query'
import { holds, readableBy } from './visibleCopies'

/**
 * Spine, AD-7: the one reader of the Books the viewer is reading, for the
 * collection's Currently reading strip and its rows' Reading ending (and
 * Stats). Only the viewer's own `user-books` rows in reading (AD-8: not read,
 * `readingSince` set), and only for a Book the viewer still holds: a visible
 * copy (owned or ordered) or a visible open wishlist entry. A row whose Book
 * is no longer held is not listed, and another user's rows never are. The
 * AD-4 read rule applies on `books`. Never narrowed by a shelf query.
 *
 * Order: `readingSince` ascending, then Book id. `since` is the start's UTC
 * date, `YYYY-MM-DD`. Read-only; hydrated through one `getEffectiveBooks()`,
 * and a Book missing from it drops.
 */
export async function readingNow(ctx: Context): Promise<ReadingBook[]> {
  const viewer = ctx.user
  const { rows } = await drizzleFor(ctx).execute(sql`
    select ub.book_id, to_char(ub.reading_since at time zone 'UTC', 'YYYY-MM-DD') as since
      from user_books ub
      join books b on b.id = ub.book_id and ${readableBy(viewer, 'b')}
     where ub.owner_id = ${viewer.id} and ${readStateOf} = 'reading'
       and ${holds(viewer, 'b')}
     order by ub.reading_since asc, ub.book_id asc`)

  const reading = rows.map((row) => ({ bookId: Number(row.book_id), since: String(row.since) }))
  const books = await getEffectiveBooks(
    ctx,
    reading.map((r) => r.bookId),
  )
  return reading.flatMap(({ bookId, since }) => {
    const book = books.get(bookId)
    return book ? [{ book, since }] : []
  })
}
