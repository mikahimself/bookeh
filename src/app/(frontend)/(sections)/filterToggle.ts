import type { ShelfQuery } from '@/lib/shelf/query'

type Filters = ShelfQuery['filters']

/**
 * The fields the Filter panel taps: the option lists of values in use, and
 * the comboboxes' short lists (EXPERIENCE.md, Filter panel).
 */
export type ListedField =
  'location' | 'status' | 'read' | 'genre' | 'language' | 'author' | 'series' | 'publisher'

/** One value of `field`: an element of a listed field, or `read`'s boolean. */
export type ListedValue<F extends ListedField> = F extends 'read'
  ? boolean
  : NonNullable<Filters[F]> extends (infer V)[]
    ? V
    : never

/**
 * `query` after a tap on `value` in the Filter panel. A list field gains the
 * value, or loses it when it is on; losing the last drops the field. `read`
 * holds one value: tapping the other switches it, tapping the one on clears
 * it. Search, sort, direction and the other fields stay.
 */
export function toggleFilter<F extends ListedField>(
  query: ShelfQuery,
  field: F,
  value: ListedValue<F>,
): ShelfQuery {
  const { [field]: current, ...rest } = query.filters
  let next: unknown
  if (field === 'read') {
    next = current === value ? undefined : value
  } else {
    const values: unknown[] = Array.isArray(current) ? current : []
    const toggled = values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
    next = toggled.length > 0 ? toggled : undefined
  }
  const filters = (next === undefined ? rest : { ...rest, [field]: next }) as Filters
  return { ...query, filters }
}

/** The fields the Filter panel sets to one value: the rating and the two ranges. */
export type SetField = 'ratingMin' | 'year' | 'pages'

/**
 * `query` with `field` set to `value`, or without it when `value` is
 * `undefined`. Search, sort, direction and the other fields stay.
 */
export function setFilter<F extends SetField>(
  query: ShelfQuery,
  field: F,
  value: Filters[F] | undefined,
): ShelfQuery {
  const { [field]: _old, ...rest } = query.filters
  const filters: Filters = value === undefined ? rest : { ...rest, [field]: value }
  return { ...query, filters }
}

/**
 * `query` after a tap on `sort` under "Sort by": the chosen sort reverses
 * `dir`, another sort becomes the sort, ascending. Search and filters stay.
 */
export function sortBy(query: ShelfQuery, sort: ShelfQuery['sort']): ShelfQuery {
  const dir = query.sort === sort && query.dir === 'asc' ? 'desc' : 'asc'
  return { ...query, sort, dir }
}

/** The fields a Filter chip on Book detail adds to (EXPERIENCE.md, Book detail). */
export type ChipField = 'author' | 'series' | 'genre' | 'location'

/**
 * `query` after a tap on a Filter chip: `id` appended to `field`, widening
 * it. A value already on leaves `query` as it is; chips never take one off.
 * Search, sort, direction and the other fields stay.
 */
export function addFilter(query: ShelfQuery, field: ChipField, id: number): ShelfQuery {
  const current = query.filters[field] ?? []
  if (current.includes(id)) return query
  return { ...query, filters: { ...query.filters, [field]: [...current, id] } }
}
