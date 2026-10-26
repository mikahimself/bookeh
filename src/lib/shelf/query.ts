/**
 * The collection's address: search, filters, sort and the open Book live in
 * `/` search params (spine, AD-7), and only `parseShelfQuery` and
 * `shelfSearchParams` (behind `shelfHref` and `shelfRowsPath`) read or write
 * them. Pure, so client components may import it (spine,
 * Design Paradigm).
 *
 * One parameter per field, named after it (`ratingMin` is `rating`); several
 * values repeat the parameter, since publishers can hold commas. `q` is
 * NFC-normalised, as every text input is at its boundary.
 * Ranges are `from-to` with either end empty. Ids are positive integers,
 * rating 1–5. A bad value is dropped and its field falls back to the default;
 * for a single-valued parameter the first value counts. No page number.
 */

import type { EffectiveBook, Named } from '@/lib/books/effectiveBook'
import type { CopyLine } from '@/lib/books/holdings'
import { isRowId } from '@/lib/payload/ref'

/** Spine, Shared shapes: what the collection lists and in what order. */
export type ShelfQuery = {
  q?: string
  filters: Partial<{
    location: number[]
    status: ('owned' | 'ordered')[]
    read: boolean
    genre: number[] // system genre ids and the user's genre tag ids
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

/** The most rows one `/data/shelf` request may ask for: the route's `limit` cap. */
export const SHELF_MAX_ROWS = 1000

/** The fields `/data/suggest` suggests names for; the route checks `field` against it. */
export const SUGGEST_FIELDS = ['author', 'series', 'publisher'] as const

/** Spine, Shared shapes. */
export type SuggestField = (typeof SUGGEST_FIELDS)[number]

/** Spine, Shared shapes: one suggested name; `id` is `null` for a publisher. */
export type Suggestion = { id: number | null; name: string }

/** Spine, Shared shapes: a filter value with how many of the viewer's copies carry it. */
export type Counted<T> = T & { count: number }

/** Spine, Shared shapes: the values in use on the viewer's copies, `filterValues()`. */
export type FilterValues = {
  location: Counted<Named>[]
  status: Counted<{ value: 'owned' | 'ordered' }>[]
  read: Counted<{ value: boolean }>[]
  genre: Counted<Named>[]
  language: Counted<{ value: string }>[]
}

/** Spine, Shared shapes: one of the viewer's copies with its Book, `getShelfRows()`. */
export type ShelfRow = { copy: CopyLine; book: EffectiveBook }

/** Spine, Shared shapes: `labels` names the id-valued filter values, keyed `field:id`. */
export type ShelfRows = { rows: ShelfRow[]; total: number; labels: Record<string, string> }

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

/** Every id column is Postgres `integer` (int4); a larger id would fail the query. */
const id = (text: string | undefined): number | undefined => {
  const n = text === undefined ? undefined : whole(text)
  return isRowId(n) ? n : undefined
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
  set('language', list(all('language'), text))
  set('author', list(all('author'), id))
  set('series', list(all('series'), id))
  set('publisher', list(all('publisher'), text))
  set('ratingMin', rating(one('rating')))
  set('year', range(one('year')))
  set('pages', range(one('pages')))

  const q = text(one('q')?.normalize('NFC'))
  const query: ShelfQuery = {
    ...(q === undefined ? {} : { q }),
    filters,
    sort: oneOf(SORTS)(one('sort')) ?? 'author',
    dir: oneOf(DIRS)(one('dir')) ?? 'asc',
  }
  return { query, book: id(one('book')) ?? null }
}

/**
 * The canonical shelf params for `query` and `book`: `q`, the filters in
 * `ShelfQuery` order, `sort`, `dir`, `book`; default sort and dir, empty
 * filters and repeated values left out. The one writer of shelf params, for
 * links and `/data/shelf` requests alike.
 */
export function shelfSearchParams(
  query: ShelfQuery,
  { book = null }: { book?: number | null } = {},
): URLSearchParams {
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
  return params
}

/** `/` with the canonical query string for `query` and `book` (`shelfSearchParams`). */
export function shelfHref(
  query: ShelfQuery,
  { book = null }: { book?: number | null } = {},
): string {
  const search = shelfSearchParams(query, { book }).toString()
  return search ? `/?${search}` : '/'
}

/** The `/data/shelf` request for `range` of `query`'s rows. */
export function shelfRowsPath(query: ShelfQuery, { offset, limit }: ShelfRange): `/data/${string}` {
  const params = shelfSearchParams(query)
  params.set('offset', String(offset))
  params.set('limit', String(limit))
  return `/data/shelf?${params.toString()}`
}
