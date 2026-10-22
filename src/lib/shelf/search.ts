import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import type { Context } from '@/lib/payload/context'

import { effective, effectiveAuthorIds } from './effective'
import { containsPattern } from './like'
import { readableBy } from './visibleCopies'

type Viewer = Context['user']

/**
 * Spine, AD-7: `q` as one condition on the shelf's aliases (`copies`, `b`,
 * `ub`), or none for an empty or blank `q`. The trimmed `q` is one literal
 * substring (`\`, `%`, `_` escaped), matched with plain `ILIKE`: case-folded
 * under the database's Finnish collation, never accent-folded. It matches the
 * effective title, an effective author's name, the effective series' name,
 * ISBN-13 or the copy's own notes; authors and series pass the AD-4 read rule.
 * The matching authors are an uncorrelated `array(…)`, so `ILIKE` runs over
 * `authors` once per query; as an `in (select …)` the planner pulls it into a
 * per-row join that scans every author for every copy.
 */
export function textSearch(viewer: Viewer, q: string | undefined): SQL | undefined {
  const text = q?.trim()
  if (!text) return undefined
  const pattern = containsPattern(text)
  const like = (value: SQL) => sql`${value} ilike ${pattern} escape '\\'`

  return sql`(
    ${like(effective('title'))}
    or exists (select 1 from (${effectiveAuthorIds}) e
      where e.authors_id = any(array(select a.id from authors a
        where ${readableBy(viewer, 'a')} and ${like(sql`a.name`)})))
    or exists (select 1 from series s
      where s.id = ${effective('series')} and ${readableBy(viewer, 's')} and ${like(sql`s.name`)})
    or ${like(sql`b.isbn13`)}
    or ${like(sql`copies.notes`)})`
}
