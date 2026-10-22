import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import type { OverridableBookField } from '@/fields/bookFields'
import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'

import type { ShelfQuery, ShelfRange } from './query'
import { readableBy, visibleCopies } from './visibleCopies'

/** The sorts built so far; Story 5.6 adds `author`. */
type SortedQuery = Omit<ShelfQuery, 'sort'> & { sort: 'title' | 'year' | 'added' }

/**
 * Spine, AD-6: the viewer's value of `field`, read from `ub` only when the
 * field is listed in `ub.overridden`. With no `user_books` row the test is
 * null and the Book's value applies.
 */
const effective = (field: Extract<OverridableBookField, 'title' | 'year'>): SQL => {
  const column = sql.identifier(field)
  return sql`(case when ub.overridden ? ${field} then ub.${column} else b.${column} end)`
}

/**
 * Spine, AD-7: the viewer's copies in `query`'s order, the slice `range` of
 * them with their Book ids, and how many there are in all. Read-only, with
 * system privileges: `visibleCopies` and the AD-4 read rule on `books` decide
 * what is seen. `user_books` joins on the viewer, never the copy's owner.
 * Every sort ends on copy id in the same direction. `q` and filters are not
 * applied yet (5.3–5.5).
 */
export async function shelfIds(
  ctx: Context,
  query: SortedQuery,
  range: ShelfRange,
): Promise<{ ids: { copyId: number; bookId: number }[]; total: number }> {
  const viewer = ctx.user
  const from = sql`
    from copies
    join books b on b.id = copies.book_id and ${readableBy(viewer, 'b')}
    left join user_books ub on ub.book_id = b.id and ub.owner_id = ${viewer.id}
    where ${visibleCopies(viewer)}`

  const dir = sql.raw(query.dir === 'asc' ? 'asc' : 'desc')
  const key = {
    title: sql`${effective('title')} ${dir}`,
    year: sql`${effective('year')} ${dir} nulls last`,
    added: sql`copies.created_at ${dir}`,
  }[query.sort]

  const page = await drizzleFor(ctx).execute(sql`
    select copies.id as copy_id, b.id as book_id ${from}
    order by ${key}, copies.id ${dir}
    offset ${range.offset} limit ${range.limit}`)
  const count = await drizzleFor(ctx).execute(sql`select count(*) as total ${from}`)

  return {
    ids: page.rows.map((row) => ({ copyId: Number(row.copy_id), bookId: Number(row.book_id) })),
    total: Number(count.rows[0]?.total ?? 0),
  }
}
