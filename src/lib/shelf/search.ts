import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import type { Context } from '@/lib/payload/context'

import { effective } from './effective'
import { readableBy } from './visibleCopies'

type Viewer = Context['user']

/**
 * Spine, AD-7: `q` as one condition on the shelf's aliases (`copies`, `b`,
 * `ub`), or none for an empty or blank `q`. The trimmed `q` is one literal
 * substring (`\`, `%`, `_` escaped), matched with plain `ILIKE`: case-folded
 * under the database's Finnish collation, never accent-folded. It matches the
 * effective title, an effective author's name, the effective series' name,
 * ISBN-13 or the copy's own notes; authors and series pass the AD-4 read rule.
 */
export function textSearch(viewer: Viewer, q: string | undefined): SQL | undefined {
  const text = q?.trim()
  if (!text) return undefined
  const pattern = `%${text.replace(/[\\%_]/g, '\\$&')}%`
  const like = (value: SQL) => sql`${value} ilike ${pattern} escape '\\'`

  const authorIn = (rels: string, parent: string) => sql`exists (
    select 1 from ${sql.identifier(rels)} r
    join authors a on a.id = r.authors_id
    where r.parent_id = ${sql.identifier(parent)}.id and r.path = 'authors'
      and ${readableBy(viewer, 'a')} and ${like(sql`a.name`)})`

  return sql`(
    ${like(effective('title'))}
    or (ub.overridden ? 'authors' and ${authorIn('user_books_rels', 'ub')})
    or (coalesce(not ub.overridden ? 'authors', true) and ${authorIn('books_rels', 'b')})
    or exists (select 1 from series s
      where s.id = ${effective('series')} and ${readableBy(viewer, 's')} and ${like(sql`s.name`)})
    or ${like(sql`b.isbn13`)}
    or ${like(sql`copies.notes`)})`
}
