/**
 * The collection's address: search, filters, sort and the open Book live in
 * `/` search params (spine, AD-7), and only `parseShelfQuery` and `shelfHref`
 * read or write them. Pure, so client components may import it (spine,
 * Design Paradigm).
 *
 * One parameter per field, named after it (`ratingMin` is `rating`); several
 * values repeat the parameter, since publishers and themes can hold commas.
 * Ranges are `from-to` with either end empty. Ids are positive integers,
 * rating 1–5. A bad value is dropped and its field falls back to the default;
 * for a single-valued parameter the first value counts. No page number.
 */

/** Spine, Shared shapes: what the collection lists and in what order. */
export type ShelfQuery = {
  q?: string
  filters: Partial<{
    location: number[]
    status: ('owned' | 'ordered')[]
    read: boolean
    genre: number[] // system genre ids and the user's genre tag ids
    tag: number[]
    theme: string[] // by text: system themes exactly, the user's themes by name
    language: string[]
    author: number[]
    series: number[]
    publisher: string[]
    ratingMin: number
    year: [number?, number?]
    pages: [number?, number?]
  }>
  sort: 'author' | 'title' | 'year' | 'added'
  dir: 'asc' | 'desc'
}

/** Spine, Shared shapes: one slice of the ordered shelf, as offset and limit. */
export type ShelfRange = { offset: number; limit: number }

/** AD-7: the one fixed page size, shared by the page and the client list. */
export const SHELF_PAGE_SIZE = 50

/** Spine, Shared shapes: the parsed address; the client list keys on `query` alone. */
export type ShelfAddress = { query: ShelfQuery; book: number | null }

/** `useSearchParams()` on the client, or a page's awaited `searchParams`. */
export type ShelfParams = URLSearchParams | Record<string, string | string[] | undefined>

type Filters = ShelfQuery['filters']
type Range = [number?, number?]

const SORTS: readonly ShelfQuery['sort'][] = ['author', 'title', 'year', 'added']
const DIRS: readonly ShelfQuery['dir'][] = ['asc', 'desc']
const STATUSES: readonly ('owned' | 'ordered')[] = ['owned', 'ordered']

const whole = (text: string): number | undefined => {
  if (!/^\d+$/.test(text)) return undefined
  const n = Number(text)
  return Number.isSafeInteger(n) ? n : undefined
}

const id = (text: string | undefined): number | undefined => {
  const n = text === undefined ? undefined : whole(text)
  return n !== undefined && n > 0 ? n : undefined
}

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (text: string | undefined): T | undefined =>
    values.find((v) => v === text)

const text = (value: string | undefined): string | undefined => (value ? value : undefined)

const bool = (value: string | undefined): boolean | undefined =>
  value === 'true' ? true : value === 'false' ? false : undefined

const rating = (value: string | undefined): number | undefined => {
  const n = id(value)
  return n !== undefined && n <= 5 ? n : undefined
}

const range = (value: string | undefined): Range | undefined => {
  const match = value === undefined ? null : /^(\d*)-(\d*)$/.exec(value)
  if (!match || (match[1] === '' && match[2] === '')) return undefined
  const from = match[1] === '' ? undefined : whole(match[1])
  const to = match[2] === '' ? undefined : whole(match[2])
  if ((match[1] !== '' && from === undefined) || (match[2] !== '' && to === undefined)) {
    return undefined
  }
  if (from !== undefined && to !== undefined && from > to) return undefined
  return [from, to]
}

/** The values that parse, deduplicated in first-seen order; none is no filter. */
const list = <T>(values: string[], parse: (value: string) => T | undefined): T[] | undefined => {
  const out: T[] = []
  for (const value of values) {
    const parsed = parse(value)
    if (parsed !== undefined && !out.includes(parsed)) out.push(parsed)
  }
  return out.length > 0 ? out : undefined
}

/** Reads the collection's address. Never throws; unknown parameters are ignored. */
export function parseShelfQuery(params: ShelfParams): ShelfAddress {
  const all = (name: string): string[] => {
    if (params instanceof URLSearchParams) return params.getAll(name)
    const value = Object.hasOwn(params, name) ? params[name] : undefined
    return value === undefined ? [] : Array.isArray(value) ? value : [value]
  }
  const one = (name: string): string | undefined => all(name)[0]

  const filters: Filters = {}
  const set = <K extends keyof Filters>(key: K, value: Filters[K] | undefined) => {
    if (value !== undefined) filters[key] = value
  }
  set('location', list(all('location'), id))
  set('status', list(all('status'), oneOf(STATUSES)))
  set('read', bool(one('read')))
  set('genre', list(all('genre'), id))
  set('tag', list(all('tag'), id))
  set('theme', list(all('theme'), text))
  set('language', list(all('language'), text))
  set('author', list(all('author'), id))
  set('series', list(all('series'), id))
  set('publisher', list(all('publisher'), text))
  set('ratingMin', rating(one('rating')))
  set('year', range(one('year')))
  set('pages', range(one('pages')))

  const q = text(one('q'))
  const query: ShelfQuery = {
    ...(q === undefined ? {} : { q }),
    filters,
    sort: oneOf(SORTS)(one('sort')) ?? 'author',
    dir: oneOf(DIRS)(one('dir')) ?? 'asc',
  }
  return { query, book: id(one('book')) ?? null }
}

/**
 * `/` with the canonical query string for `query` and `book`: `q`, the
 * filters in `ShelfQuery` order, `sort`, `dir`, `book`; default sort and dir,
 * empty filters and repeated values left out.
 */
export function shelfHref(
  query: ShelfQuery,
  { book = null }: { book?: number | null } = {},
): string {
  const params = new URLSearchParams()
  const add = (name: string, values: readonly (string | number | boolean)[] | undefined) => {
    for (const value of new Set(values?.map(String))) if (value !== '') params.append(name, value)
  }
  const rangeText = (r: Range | undefined): string[] | undefined =>
    r && (r[0] !== undefined || r[1] !== undefined) ? [`${r[0] ?? ''}-${r[1] ?? ''}`] : undefined
  const one = <T>(value: T | undefined): T[] | undefined =>
    value === undefined ? undefined : [value]

  const f = query.filters
  add('q', one(query.q))
  add('location', f.location)
  add('status', f.status)
  add('read', one(f.read))
  add('genre', f.genre)
  add('tag', f.tag)
  add('theme', f.theme)
  add('language', f.language)
  add('author', f.author)
  add('series', f.series)
  add('publisher', f.publisher)
  add('rating', one(f.ratingMin))
  add('year', rangeText(f.year))
  add('pages', rangeText(f.pages))
  if (query.sort !== 'author') params.set('sort', query.sort)
  if (query.dir !== 'asc') params.set('dir', query.dir)
  add('book', one(book ?? undefined))

  const search = params.toString()
  return search ? `/?${search}` : '/'
}
