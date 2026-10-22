import { sql } from '@payloadcms/db-postgres/drizzle'

import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'

import { effective, firstAuthorSortName } from './effective'
import { relationFilters, scalarFilters } from './filters'
import type { ShelfQuery, ShelfRange } from './query'
import { textSearch } from './search'
import { readableBy, visibleCopies } from './visibleCopies'

/**
 * Spine, AD-7: the viewer's copies in `query`'s order, the slice `range` of
 * them with their Book ids, and how many there are in all. Read-only, with
 * system privileges: `visibleCopies` and the AD-4 read rule on `books` decide
 * what is seen. `user_books` joins on the viewer, never the copy's owner.
 * `author` orders by the first readable effective author's `sortName`, no
 * author last both ways, then the effective title. Every sort ends on copy id
 * in the same direction. `q` (`textSearch`), the scalar filters
 * (`scalarFilters`) and the author, series and genre filters
 * (`relationFilters`) narrow the shared `from`, so the count applies them too;
 * tag and theme are not applied yet (Epic 9).
 */
export async function shelfIds(
  ctx: Context,
  query: ShelfQuery,
  range: ShelfRange,
): Promise<{ ids: { copyId: number; bookId: number }[]; total: number }> {
  const viewer = ctx.user
  const conditions = [
    visibleCopies(viewer),
    textSearch(viewer, query.q),
    scalarFilters(query.filters),
    relationFilters(viewer, query.filters),
  ].filter((condition) => condition !== undefined)
  const from = sql`
    from copies
    join books b on b.id = copies.book_id and ${readableBy(viewer, 'b')}
    left join user_books ub on ub.book_id = b.id and ub.owner_id = ${viewer.id}
    where ${sql.join(conditions, sql` and `)}`

  const dir = sql.raw(query.dir === 'asc' ? 'asc' : 'desc')
  const key = {
    author: sql`${firstAuthorSortName(viewer)} ${dir} nulls last, ${effective('title')} ${dir}`,
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
