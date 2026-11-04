// Open Library, the third source (FR-11, AD-9): core fields and subject names, no cover.
// One request per lookup (`jscmd=data`), one per search (`search.json`). It carries no
// description or language for these records, and its cover URLs redirect, which AD-14
// refuses — so this source sets no `coverUrl` and `COVER_HOSTS` does not name its host.
import { toIsbn13 } from '@/fields/isbn'

import type { SearchHit, Source, SourceResult } from '../source'
import {
  clean,
  compact,
  getJson,
  isObject,
  list,
  lookupFailed,
  sourceFailed,
  strings,
  type Json,
} from './shared'

/** The environment the contact is read from; `process.env` unless a caller passes its own. */
type Env = Readonly<Record<string, string | undefined>>

const LABEL = 'Open Library'
const ORIGIN = 'https://openlibrary.org'

/** One screen of Lookup results per source, as Google Books uses. */
const MAX_RESULTS = 20

/** The `search.json` fields asked for: the work, plus the edition docs a hit is built from. */
export const OPEN_LIBRARY_FIELDS = [
  'key',
  'title',
  'author_name',
  'editions',
  'editions.key',
  'editions.title',
  'editions.isbn',
  'editions.publisher',
  'editions.publish_year',
  'editions.physical_format',
] as const

/**
 * The contact Open Library asks every client to identify itself with, read at call time.
 * Unset, the source is left out of `sources/index.ts` entirely (never a dependency), so
 * every request that does go out is identified.
 */
export function openLibraryContact(env: Env = process.env): string | undefined {
  return env.OPEN_LIBRARY_CONTACT?.trim() || undefined
}

/** `User-Agent: bookeh (<contact>)`; empty while there is no contact, so nothing is faked. */
export function openLibraryHeaders(env: Env = process.env): Record<string, string> {
  const contact = openLibraryContact(env)
  return contact ? { 'User-Agent': `bookeh (${contact})` } : {}
}

export function openLibraryUrl(isbn13: string): string {
  const params = new URLSearchParams({
    bibkeys: `ISBN:${isbn13}`,
    jscmd: 'data',
    format: 'json',
  })
  return `${ORIGIN}/api/books?${params}`
}

/** Free-text search (FR-20), with the edition docs of each matching work. */
export function openLibrarySearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    fields: OPEN_LIBRARY_FIELDS.join(','),
    limit: String(MAX_RESULTS),
  })
  return `${ORIGIN}/search.json?${params}`
}

// --- Fields ------------------------------------------------------------------------------

/** `[{ name }]` entries with a name, de-duplicated; Open Library's own order and spelling. */
function named(value: unknown): string[] {
  const names = list(value)
    .filter(isObject)
    .flatMap((entry) => clean(entry.name) ?? [])
  return [...new Set(names)]
}

/**
 * Open Library's `publish_date` is free text: `"2012"`, `"May 05, 2018"`, `"1977"`. The first
 * four-digit run is the year; a value with none leaves `year` out, as Finna's `year()` does.
 */
function year(value: unknown): number | undefined {
  const text = clean(value)
  const digits = text ? /\d{4}/.exec(text) : null
  return digits ? Number(digits[0]) : undefined
}

function pages(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

/**
 * The entry for the ISBN asked for. Author names pass through as given ("Jalonen Olli"), with
 * no `sortName`: Open Library states no inverted form. `themes` stays empty — themes come from
 * Finna (FR-17a) — and the subject names are this source's `subjects`.
 */
function toResult(entry: Json, isbn13: string, body: unknown): SourceResult | undefined {
  const title = clean(entry.title)
  const recordId = clean(entry.key)
  if (!title || !recordId) return undefined
  return compact({
    isbn13,
    title,
    subtitle: clean(entry.subtitle),
    authors: named(entry.authors).map((name) => ({ name })),
    publisher: named(entry.publishers)[0],
    year: year(entry.publish_date),
    pages: pages(entry.number_of_pages),
    subjects: named(entry.subjects),
    themes: [],
    source: 'openlibrary',
    recordId,
    raw: { openlibrary: body },
  })
}

/**
 * The records of an `api/books` body for the ISBN asked for: one, or `[]` when Open Library
 * does not hold it (`{}`, or only another key) or the entry has no title or key. `undefined`
 * after one logged failure for a body that is not an object (FR-11, AD-9).
 */
export function openLibraryResults(body: unknown, isbn13: string): SourceResult[] | undefined {
  if (!isObject(body)) return lookupFailed(LABEL, isbn13, 'response is not an object')
  // `{}` is Open Library's answer for an ISBN it does not hold; only this key is read.
  const entry = body[`ISBN:${isbn13}`]
  if (!isObject(entry)) return []
  const result = toResult(entry, isbn13, body)
  return result ? [result] : []
}

// --- Search ------------------------------------------------------------------------------

/** The edition docs of one work document. */
function editions(work: Json): Json[] {
  const docs = isObject(work.editions) ? work.editions.docs : undefined
  return list(docs).filter(isObject)
}

/** A hit per distinct ISBN-13 of one edition doc; an edition with no usable ISBN gives none. */
function toHits(edition: Json, work: Json, authors: SearchHit['authors']): SearchHit[] {
  // The edition's own title, falling back to the work's: some edition docs carry none.
  const title = clean(edition.title) ?? clean(work.title)
  if (!title) return []
  const publisher = strings(edition.publisher).flatMap((name) => clean(name) ?? [])[0]
  const published = list(edition.publish_year).find(
    (value): value is number => typeof value === 'number',
  )
  const binding = clean(edition.physical_format)
  const isbn13s = new Set(strings(edition.isbn).flatMap((isbn) => toIsbn13(isbn) ?? []))
  return [...isbn13s].map((isbn13) => ({
    isbn13,
    title,
    authors,
    ...(publisher !== undefined && { publisher }),
    ...(published !== undefined && { year: published }),
    ...(binding !== undefined && { binding }),
    source: 'openlibrary',
  }))
}

/**
 * The hits of a `search.json` body, one per distinct ISBN-13 in Open Library's own order, the
 * first occurrence winning. Hits are built from each work's **edition** docs, never from the
 * work-level `isbn` list, which mixes every edition of the work; `author_name` comes from the
 * work. There is no `coverUrl` to gap-fill. `[]`, after one logged warning, when the body is
 * not a usable answer (FR-20, AD-9).
 */
export function openLibrarySearchHits(body: unknown, query: string): SearchHit[] {
  const failed = (reason: string): SearchHit[] => {
    sourceFailed(LABEL, 'search', { query }, reason)
    return []
  }
  if (!isObject(body)) return failed('response is not an object')
  if (!Array.isArray(body.docs)) return failed('docs is not an array')

  const hits = new Map<string, SearchHit>()
  for (const work of list(body.docs).filter(isObject)) {
    // `author_name` is the work's author names as plain strings, in Open Library's order.
    const authors = [
      ...new Set(strings(work.author_name).flatMap((name) => clean(name) ?? [])),
    ].map((name) => ({ name }))
    for (const edition of editions(work)) {
      for (const hit of toHits(edition, work, authors)) {
        if (!hits.has(hit.isbn13)) hits.set(hit.isbn13, hit)
      }
    }
  }
  return [...hits.values()]
}

// --- Request -----------------------------------------------------------------------------

export const openLibrary: Source = {
  id: 'openlibrary',
  async lookupByIsbn(isbn13) {
    const body = await getJson(
      LABEL,
      'lookup',
      openLibraryUrl(isbn13),
      { isbn13 },
      openLibraryHeaders(),
    )
    if (body === undefined) return undefined
    return openLibraryResults(body, isbn13)
  },
  async search(query) {
    const text = clean(query)
    if (!text) return []
    const body = await getJson(
      LABEL,
      'search',
      openLibrarySearchUrl(text),
      { query: text },
      openLibraryHeaders(),
    )
    // `getJson` has logged the failure; a search answers with a list either way.
    if (body === undefined) return []
    return openLibrarySearchHits(body, text)
  },
}
