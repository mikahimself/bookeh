import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import type { OverridableBookField } from '@/fields/bookFields'

/** The scalar fields shelf queries read; `series` is its id column. */
type ShelfField = Extract<OverridableBookField, 'title' | 'year' | 'series'>

const COLUMNS: Record<ShelfField, string> = { title: 'title', year: 'year', series: 'series_id' }

/**
 * Spine, AD-6: the viewer's value of `field` on the aliases `b` (books) and
 * `ub` (the viewer's `user_books` row), read from `ub` only when the field is
 * listed in `ub.overridden`. With no `user_books` row the test is null and
 * the Book's value applies.
 */
export const effective = (field: ShelfField): SQL => {
  const column = sql.identifier(COLUMNS[field])
  return sql`(case when ub.overridden ? ${field} then ub.${column} else b.${column} end)`
}
