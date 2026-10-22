import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'

import { effective, effectiveAuthorIds } from './effective'
import { containsPattern } from './like'
import type { Suggestion, SuggestField } from './query'
import { readableBy, visibleCopies } from './visibleCopies'

export const SUGGEST_LIMIT = 10

/**
 * Spine, AD-7: up to `SUGGEST_LIMIT` names for `field` containing the trimmed
 * `text` (case-insensitive `ILIKE`, `\` `%` `_` literal), ordered by name.
 * Only effective values (AD-6) of Books behind the viewer's copies; authors
 * and series pass the AD-4 read rule and are distinct on `name_key`, the
 * shared record's id first, else the lowest. Publishers are distinct values,
 * with `id: null`. Blank text suggests nothing. Read-only.
 */
export async function suggest(
  ctx: Context,
  field: SuggestField,
  text: string,
): Promise<Suggestion[]> {
  const trimmed = text.trim()
  if (!trimmed) return []
  const viewer = ctx.user
  const pattern = containsPattern(trimmed)
  const from = (join: SQL) => sql`
    from copies
    join books b on b.id = copies.book_id and ${readableBy(viewer, 'b')}
    left join user_books ub on ub.book_id = b.id and ub.owner_id = ${viewer.id}
    ${join}
    where ${visibleCopies(viewer)}`

  if (field === 'publisher') {
    const publisher = effective('publisher')
    const { rows } = await drizzleFor(ctx).execute(sql`
      select distinct ${publisher} as name ${from(sql``)}
        and ${publisher} ilike ${pattern} escape '\\'
      order by name limit ${SUGGEST_LIMIT}`)
    return rows.map((row) => ({ id: null, name: String(row.name) }))
  }

  const join =
    field === 'author'
      ? sql`join authors n on n.id in (${effectiveAuthorIds}) and ${readableBy(viewer, 'n')}`
      : sql`join series n on n.id = ${effective('series')} and ${readableBy(viewer, 'n')}`
  const { rows } = await drizzleFor(ctx).execute(sql`
    select id, name from (
      select distinct on (n.name_key) n.id, n.name ${from(join)}
        and n.name ilike ${pattern} escape '\\'
      order by n.name_key, (n.visibility = 'shared') desc, n.id
    ) named
    order by name, id limit ${SUGGEST_LIMIT}`)
  return rows.map((row) => ({ id: Number(row.id), name: String(row.name) }))
}
