import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import { getEffectiveBooks } from '@/lib/books/effectiveBook'
import { getHoldings } from '@/lib/books/holdings'
import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'

import { effective, firstAuthorSortName } from './effective'
import type { MyBook } from './query'
import { textSearch } from './search'
import { readableBy, visibleCopies, visibleEntries } from './visibleCopies'

/**
 * The most own Books one Lookup search reports. The same per-source hit cap
 * the adapters ask for, so the two Lookup groups stay comparable; the own
 * branch has no request to bound it, so it states its own.
 */
export const MINE_SEARCH_LIMIT = 20

/**
 * Spine, AD-7: Lookup's own-library reader. One text search over the viewer's
 * visible copies and their visible *open* wishlist entries, on effective
 * (override-aware) title, author, series and ISBN-13 — the shelf's own
 * `textSearch`, without the per-copy notes clause, which only copies have.
 * The shared catalogue is never listed on its own: `books`, `authors` and
 * `series` are reached through a holding, under the AD-4 read rule.
 *
 * Read-only, with system privileges, exactly as `shelfIds` runs. One row per
 * Book: a `union` (not `union all`) of the two branches collapses a Book held
 * both ways in the database, and the hydrated ids are made distinct again in
 * code, so one Book is one row whatever the sort key does.
 * Order is the shelf's `author` ascending — first readable effective author's
 * `sortName`, no author last, then the effective title, then the Book id — and
 * at most `MINE_SEARCH_LIMIT` Books, both applied in SQL. Blank text asks
 * nothing. Unlike `getHoldings`, where a Book's current readability plays no
 * part, the AD-4 read rule applies here: the join drops a Book the viewer may
 * not read, so an unreadable one never reaches the hydration. Hydration
 * mirrors `getShelfRows`: one `getEffectiveBooks()` and one `getHoldings()`
 * over the distinct ids in SQL order, and a Book deleted between the two
 * reads drops its row.
 */
export async function searchMine(ctx: Context, text: string): Promise<MyBook[]> {
  const viewer = ctx.user
  const matches = textSearch(viewer, text)
  if (!matches) return []

  const branch = (table: SQL, where: SQL[]): SQL => sql`
    select b.id as book_id, ${firstAuthorSortName(viewer)} as sort_name,
           ${effective('title')} as title
      from ${table}
      join books b on b.id = ${table}.book_id and ${readableBy(viewer, 'b')}
      left join user_books ub on ub.book_id = b.id and ub.owner_id = ${viewer.id}
     where ${sql.join([...where, matches], sql` and `)}`

  const rows = await drizzleFor(ctx).execute(sql`
    select m.book_id from (
      ${branch(sql`copies`, [visibleCopies(viewer)])}
      union
      ${branch(sql`wishlist_entries`, [
        visibleEntries(viewer),
        sql`wishlist_entries.closed_at is null`,
      ])}
    ) m
    order by m.sort_name asc nulls last, m.title asc, m.book_id asc
    limit ${MINE_SEARCH_LIMIT}`)

  const bookIds = [...new Set(rows.rows.map((row) => Number(row.book_id)))]
  const [books, holdings] = await Promise.all([
    getEffectiveBooks(ctx, bookIds),
    getHoldings(ctx, bookIds),
  ])

  return bookIds.flatMap((bookId) => {
    const book = books.get(bookId)
    const mine = holdings.get(bookId)
    return book && mine ? [{ book, mine }] : []
  })
}
