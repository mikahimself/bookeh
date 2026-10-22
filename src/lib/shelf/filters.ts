import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import type { Context } from '@/lib/payload/context'

import { effective, effectiveAuthorIds } from './effective'
import type { ShelfQuery } from './query'
import { readableBy } from './visibleCopies'

type Filters = ShelfQuery['filters']
type Viewer = Context['user']

/** `value` within the inclusive range, either end open; a null value fails either end. */
const inRange = (value: SQL, [from, to]: [number?, number?]): SQL[] => [
  ...(from !== undefined ? [sql`${value} >= ${from}`] : []),
  ...(to !== undefined ? [sql`${value} <= ${to}`] : []),
]

/**
 * Spine, AD-7: the scalar filters (publisher, language, year, pages, status,
 * location, read, rating) as one condition on the shelf's aliases (`copies`,
 * `b`, `ub`), or none when no field applies. Fields AND, values within a
 * field OR; an empty list or an open-ended `[undefined, undefined]` range
 * adds nothing. Book fields use effective values (AD-6); publisher and
 * language match exactly, as `filterValues()` and `suggest()` hand them out.
 * Read and rating come from the viewer's `ub` row: a missing row is unread
 * and unrated. Author, series and genre are `relationFilters`; tag and theme
 * are not handled yet (Epic 9).
 */
export function scalarFilters(filters: Filters): SQL | undefined {
  const { publisher, language, year, pages, status, location, read, ratingMin } = filters
  const conditions: SQL[] = []
  if (publisher?.length) conditions.push(sql`${effective('publisher')} in ${publisher}`)
  if (language?.length) conditions.push(sql`${effective('language')} in ${language}`)
  if (year) conditions.push(...inRange(effective('year'), year))
  if (pages) conditions.push(...inRange(effective('pages'), pages))
  if (status?.length) conditions.push(sql`copies.status in ${status}`)
  if (location?.length) conditions.push(sql`copies.location_id in ${location}`)
  if (read !== undefined) conditions.push(read ? sql`ub.read is true` : sql`ub.read is not true`)
  if (ratingMin !== undefined) conditions.push(sql`ub.rating >= ${ratingMin}`)
  return conditions.length ? sql`(${sql.join(conditions, sql` and `)})` : undefined
}

/**
 * Spine, AD-7: the author, series and genre filters as one condition on the
 * shelf's aliases, or none when no field applies; fields AND, values OR.
 * An author or series id stands for every record sharing its `name_key`: a
 * copy matches when a readable effective author (or the readable effective
 * series, AD-6) of its Book shares the `name_key` of a readable record among
 * the ids, so an unreadable id matches nothing, as in `shelfLabels`. Every
 * `genre` id is a system genre id, matched against the Book's own genres
 * (never overridden); user genre tag ids wait for their encoding in the
 * spine (Epic 9).
 */
export function relationFilters(viewer: Viewer, filters: Filters): SQL | undefined {
  const { author, series, genre } = filters
  const conditions: SQL[] = []
  if (author?.length)
    conditions.push(sql`exists (select 1 from authors a
      where a.id in (${effectiveAuthorIds}) and ${readableBy(viewer, 'a')}
        and a.name_key in (select f.name_key from authors f
          where f.id in ${author} and ${readableBy(viewer, 'f')}))`)
  if (series?.length)
    conditions.push(sql`exists (select 1 from series s
      where s.id = ${effective('series')} and ${readableBy(viewer, 's')}
        and s.name_key in (select f.name_key from series f
          where f.id in ${series} and ${readableBy(viewer, 'f')}))`)
  if (genre?.length)
    conditions.push(sql`exists (select 1 from books_rels g
      where g.parent_id = b.id and g.path = 'genres' and g.genres_id in ${genre})`)
  return conditions.length ? sql`(${sql.join(conditions, sql` and `)})` : undefined
}
