import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import type { OverridableBookField } from '@/fields/bookFields'
import type { Context } from '@/lib/payload/context'

import { readableBy } from './visibleCopies'

type Viewer = Context['user']

/** The scalar fields shelf queries read; `series` is its id column. */
type ShelfField = Extract<
  OverridableBookField,
  'title' | 'year' | 'series' | 'language' | 'publisher' | 'pages'
>

const COLUMNS: Record<ShelfField, string> = {
  title: 'title',
  year: 'year',
  series: 'series_id',
  language: 'language',
  publisher: 'publisher',
  pages: 'pages',
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
 * Spine, AD-6: the effective authors of the Book on `b` and `ub` as rows of
 * `authors_id` and their position `order`: the Book's own unless the viewer's
 * row lists `authors`, then the row's.
 */
export const effectiveAuthorRows: SQL = sql`
  select r.authors_id, r."order" from books_rels r
   where r.parent_id = b.id and r.path = 'authors' and not coalesce(ub.overridden ? 'authors', false)
  union all
  select r.authors_id, r."order" from user_books_rels r
   where r.parent_id = ub.id and r.path = 'authors' and ub.overridden ? 'authors'`

/** Spine, AD-6: the ids of the effective authors of the Book on `b` and `ub`, as rows. */
export const effectiveAuthorIds: SQL = sql`select e.authors_id from (${effectiveAuthorRows}) e`

/**
 * Spine, AD-7: the author sort key, the `sort_name` of the first effective
 * author (lowest `order`) the viewer may read; the first author Book detail
 * shows, since unreadable ones are dropped there. Null with none. `offset 0`
 * keeps the lateral a primary-key lookup per author row; flattened, the
 * planner may hash-join a scan of every author for every copy.
 */
export const firstAuthorSortName = (viewer: Viewer): SQL => sql`(
  select a.sort_name from (${effectiveAuthorRows}) e
    cross join lateral (select a.sort_name from authors a
      where a.id = e.authors_id and ${readableBy(viewer, 'a')} offset 0) a
   order by e."order" limit 1)`
