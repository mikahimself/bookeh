import { shelfHref, type ShelfQuery } from '@/lib/shelf/query'

/** The `collection.*` keys the count line's values use. */
export type CountLineKey =
  | 'quoted'
  | 'statuses.owned'
  | 'statuses.ordered'
  | 'read'
  | 'unread'
  | 'rating'
  | 'yearRange'
  | 'pagesRange'

export type CountLineT = (key: CountLineKey, values?: Record<string, string | number>) => string

type IdField = 'location' | 'genre' | 'tag' | 'author' | 'series'

/** Whether a search or any filter is on: the count line then lists them with Clear. */
export function isNarrowed(query: ShelfQuery): boolean {
  return query.q !== undefined || Object.keys(query.filters).length > 0
}

/** Clear: the same sort and direction, no search, no filters, no open Book. */
export function clearHref(query: ShelfQuery): string {
  return shelfHref({ filters: {}, sort: query.sort, dir: query.dir })
}

/**
 * EXPERIENCE.md, Count line: the active search and filter values as shown,
 * in `ShelfQuery` order. Ids take their name from `labels`; an id without one
 * is left out.
 */
export function activeValues(
  query: ShelfQuery,
  labels: Record<string, string>,
  t: CountLineT,
): string[] {
  const f = query.filters
  const named = (field: IdField, ids: number[] | undefined): string[] =>
    (ids ?? []).flatMap((id) => {
      const key = `${field}:${id}`
      return Object.hasOwn(labels, key) ? [labels[key]] : []
    })
  const range = (
    key: 'yearRange' | 'pagesRange',
    value: [number?, number?] | undefined,
  ): string[] => (value ? [t(key, { from: value[0] ?? '', to: value[1] ?? '' })] : [])

  return [
    ...(query.q === undefined ? [] : [t('quoted', { text: query.q })]),
    ...named('location', f.location),
    ...(f.status ?? []).map((status) => t(`statuses.${status}`)),
    ...(f.read === undefined ? [] : [t(f.read ? 'read' : 'unread')]),
    ...named('genre', f.genre),
    ...named('tag', f.tag),
    ...(f.theme ?? []),
    ...(f.language ?? []),
    ...named('author', f.author),
    ...named('series', f.series),
    ...(f.publisher ?? []),
    ...(f.ratingMin === undefined ? [] : [t('rating', { n: f.ratingMin })]),
    ...range('yearRange', f.year),
    ...range('pagesRange', f.pages),
  ]
}
