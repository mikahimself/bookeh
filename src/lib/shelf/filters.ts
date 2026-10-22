import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import { effective } from './effective'
import type { ShelfQuery } from './query'

type Filters = ShelfQuery['filters']

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
 * and unrated. Author, series, genre, tag and theme are not handled here.
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
