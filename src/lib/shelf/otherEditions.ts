import { sql } from '@payloadcms/db-postgres/drizzle'

import { getEffectiveBooks } from '@/lib/books/effectiveBook'
import { getHoldings } from '@/lib/books/holdings'
import { toNameKey } from '@/fields/nameKey'
import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'

import { effectiveAuthorIds } from './effective'
import type { MyBook } from './query'
import { readableBy, visibleCopies } from './visibleCopies'

/**
 * The title two editions of one work share (FR-20, other edition): case-folded,
 * the subtitle after the first `:` dropped, a trailing ` /` (MARC's statement
 * of responsibility) and surrounding punctuation trimmed, inner whitespace
 * collapsed. Exact equality of this is the match; never fuzzy.
 */
export function editionTitle(title: string): string {
  return title
    .normalize('NFC')
    .split(':', 1)[0]!
    .replace(/\s+/g, ' ')
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')
    .toLowerCase()
}

/**
 * Spine, AD-7 and FR-20: the Answer's other-edition read, beside `searchMine`.
 * The Books other than `bookId` that the viewer has a copy of (owned, lent or
 * ordered; wishlist entries never count), whose effective title has the same
 * `editionTitle()` as `title` and which share at least one effective author
 * with `authors`, by `nameKey` (`toNameKey()`, the Names convention). `[]` without a query when
 * `authors` or the normalised title is empty.
 *
 * SQL narrows by the viewer's visible copies, the AD-4 read rule on the Book
 * and its authors, and author name; the title is compared here in code, so
 * SQL and TS never disagree on the normalisation, and no `LIMIT` can drop a
 * match (one author's Books in one library is a small set). The matching
 * authors are an uncorrelated `array(…)`, as in `textSearch`. Hydration is
 * `searchMine`'s: `getEffectiveBooks()` then `getHoldings()`, sequentially
 * (AD-16). Read-only, with system privileges, as `searchMine` runs.
 */
export async function otherEditions(
  ctx: Context,
  { bookId, title, authors }: { bookId: number | null; title: string; authors: string[] },
): Promise<MyBook[]> {
  const viewer = ctx.user
  const key = editionTitle(title)
  const keys = [...new Set(authors.map(toNameKey))].filter(Boolean)
  if (!key || keys.length === 0) return []

  const rows = await drizzleFor(ctx).execute(sql`
    select distinct b.id as book_id
      from copies
      join books b on b.id = copies.book_id and ${readableBy(viewer, 'b')}
      left join user_books ub on ub.book_id = b.id and ub.owner_id = ${viewer.id}
     where ${visibleCopies(viewer)}
       ${bookId === null ? sql`` : sql`and b.id <> ${bookId}`}
       and exists (select 1 from (${effectiveAuthorIds}) e
         where e.authors_id = any(array(select a.id from authors a
           where ${readableBy(viewer, 'a')}
             and a.name_key in (${sql.join(
               keys.map((k) => sql`${k}`),
               sql`, `,
             )}))))
     order by b.id`)

  const bookIds = rows.rows.map((row) => Number(row.book_id))
  // AD-16: readers sharing a Payload context must finish sequentially.
  const books = await getEffectiveBooks(ctx, bookIds)
  const matching = bookIds.filter((id) => {
    const book = books.get(id)
    return book !== undefined && editionTitle(book.title) === key
  })
  const holdings = await getHoldings(ctx, matching)

  return matching.flatMap((id) => {
    const book = books.get(id)
    const mine = holdings.get(id)
    // A copy gone since the SQL read leaves nothing to show.
    return book && mine && mine.copies.length > 0 ? [{ book, mine }] : []
  })
}
