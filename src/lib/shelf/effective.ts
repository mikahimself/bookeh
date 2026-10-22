import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import type { OverridableBookField } from '@/fields/bookFields'

/** The scalar fields shelf queries read; `series` is its id column. */
type ShelfField = Extract<
  OverridableBookField,
  'title' | 'year' | 'series' | 'language' | 'publisher'
>

const COLUMNS: Record<ShelfField, string> = {
  title: 'title',
  year: 'year',
  series: 'series_id',
  language: 'language',
  publisher: 'publisher',
}

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

/**
 * Spine, AD-6: the ids of the effective authors of the Book on `b` and `ub`,
 * as rows: the Book's own unless the viewer's row lists `authors`, then the
 * row's.
 */
export const effectiveAuthorIds: SQL = sql`
  select r.authors_id from books_rels r
   where r.parent_id = b.id and r.path = 'authors' and not coalesce(ub.overridden ? 'authors', false)
  union all
  select r.authors_id from user_books_rels r
   where r.parent_id = ub.id and r.path = 'authors' and ub.overridden ? 'authors'`
