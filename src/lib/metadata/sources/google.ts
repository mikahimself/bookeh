// Google Books, the second source (FR-11, AD-9): core fields, categories as subjects, covers.
import { toIsbn13 } from '@/fields/isbn'

import type { SearchHit, Source, SourceResult } from '../source'
import {
  clean,
  compact,
  getJson,
  isObject,
  isoLanguage,
  list,
  lookupFailed,
  sourceFailed,
  strings,
  type Json,
} from './shared'

const LABEL = 'Google Books'

/** Google's default page is 10, its cap 40; 20 is one screen of Lookup results per source. */
const MAX_RESULTS = 20

/**
 * The volumes endpoint with these params. The key is optional (keyless requests share
 * Google's daily quota) and read at call time, so both callers pick up a late env change.
 */
function volumesUrl(params: Record<string, string>): string {
  const query = new URLSearchParams(params)
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim()
  if (key) query.set('key', key)
  return `https://www.googleapis.com/books/v1/volumes?${query}`
}

function googleUrl(isbn13: string): string {
  return volumesUrl({ q: `isbn:${isbn13}` })
}

/** Free-text search (FR-20); books only. */
function searchUrl(query: string): string {
  return volumesUrl({ q: query, printType: 'books', maxResults: String(MAX_RESULTS) })
}

// --- Matching ----------------------------------------------------------------------------

/** Whether an `industryIdentifiers` entry (ISBN-10 or ISBN-13) is the ISBN asked for. */
function hasIsbn(info: Json, isbn13: string): boolean {
  return list(info.industryIdentifiers)
    .filter(isObject)
    .some(({ identifier }) => typeof identifier === 'string' && toIsbn13(identifier) === isbn13)
}

/** A search hit's own ISBN-13: the first identifier that normalises, ISBN-13 entries first. */
function searchIsbn13(info: Json): string | undefined {
  const entries = list(info.industryIdentifiers).filter(isObject)
  for (const type of ['ISBN_13', 'ISBN_10']) {
    for (const { type: entryType, identifier } of entries) {
      if (entryType !== type || typeof identifier !== 'string') continue
      const isbn13 = toIsbn13(identifier)
      if (isbn13) return isbn13
    }
  }
  return undefined
}

// --- Fields ------------------------------------------------------------------------------

/** "Given Family" as Google sends them; `Martin, George R. R.` is flipped and kept as sortName. */
function authors(info: Json): SourceResult['authors'] {
  const byName = new Map<string, SourceResult['authors'][number]>()
  for (const raw of strings(info.authors)) {
    const given = clean(raw)
    if (!given) continue
    const comma = given.indexOf(',')
    const family = comma === -1 ? undefined : clean(given.slice(0, comma))
    const first = comma === -1 ? undefined : clean(given.slice(comma + 1))
    const author =
      family && first
        ? { name: `${first} ${family}`, sortName: given }
        : { name: family ?? first ?? given }
    if (!byName.has(author.name)) byName.set(author.name, author)
  }
  return [...byName.values()]
}

function year(info: Json): number | undefined {
  const digits = typeof info.publishedDate === 'string' ? /^\d{4}/.exec(info.publishedDate) : null
  return digits ? Number(digits[0]) : undefined
}

function pages(info: Json): number | undefined {
  const count = info.pageCount
  return typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : undefined
}

const ENTITIES: [RegExp, string][] = [
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&amp;/g, '&'], // last, so `&amp;lt;` stays `&lt;`
]

const TAG = /<\/?[a-z][^>]*>/gi

function decode(text: string): string {
  return ENTITIES.reduce((plain, [entity, char]) => plain.replace(entity, char), text)
}

/** Google sometimes sends HTML: paragraphs and line breaks become `\n\n`, other tags go. */
function description(info: Json): string | undefined {
  const text = clean(info.description)
  if (!text) return undefined
  if (text.search(TAG) === -1) return clean(decode(text))
  const plain = decode(text.replace(/<br\s*\/?>|<\/p\s*>/gi, '\n').replace(TAG, ''))
  return clean(
    plain
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n\n'),
  )
}

function subjects(info: Json): string[] {
  return [...new Set(strings(info.categories).flatMap((category) => clean(category) ?? []))]
}

const IMAGE_SIZES = ['thumbnail', 'smallThumbnail', 'small', 'medium', 'large', 'extraLarge']

/**
 * The first http(s) image link, over https, without the page-curl `edge` and with
 * `fife=w2000`: Google's largest real image up to 2000 px. `zoom=0` is not used because it
 * swaps a small real cover for Google's placeholder. `imgtk` and the rest are kept.
 */
function coverUrl(info: Json): string | undefined {
  const links = isObject(info.imageLinks) ? info.imageLinks : {}
  for (const size of IMAGE_SIZES) {
    const link = clean(links[size])
    if (!link || !URL.canParse(link)) continue
    const url = new URL(link)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    url.protocol = 'https:'
    url.searchParams.delete('edge')
    url.searchParams.set('fife', 'w2000')
    return url.href
  }
  return undefined
}

function toResult(volume: Json, isbn13: string, body: unknown): SourceResult | undefined {
  const info = isObject(volume.volumeInfo) ? volume.volumeInfo : {}
  const title = clean(info.title)
  const recordId = clean(volume.id)
  if (!title || !recordId) return undefined
  return compact({
    isbn13,
    title,
    subtitle: clean(info.subtitle),
    authors: authors(info),
    publisher: clean(info.publisher),
    year: year(info),
    language: isoLanguage(info.language),
    pages: pages(info),
    description: description(info),
    subjects: subjects(info),
    themes: [],
    coverUrl: coverUrl(info),
    source: 'google',
    recordId,
    raw: { google: body },
  })
}

/**
 * A hit for a volume that has a title and a usable ISBN, built field by field like Finna's
 * `toHit`. `binding` is always absent: Google's `printType` is BOOK/MAGAZINE, not a binding.
 * `coverUrl` is whatever `coverUrl()` yields, left out when it yields nothing.
 */
function toHit(volume: Json): SearchHit | undefined {
  const info = isObject(volume.volumeInfo) ? volume.volumeInfo : {}
  const title = clean(info.title)
  const isbn13 = searchIsbn13(info)
  if (!title || !isbn13) return undefined
  const publisher = clean(info.publisher)
  const published = year(info)
  const cover = coverUrl(info)
  return {
    isbn13,
    title,
    authors: authors(info),
    ...(publisher !== undefined && { publisher }),
    ...(published !== undefined && { year: published }),
    source: 'google',
    ...(cover !== undefined && { coverUrl: cover }),
  }
}

// --- Request -----------------------------------------------------------------------------

/** The response body when it is a usable answer; undefined after logging why not. */
async function fetchBody(isbn13: string): Promise<Json | undefined> {
  const body = await getJson(LABEL, 'lookup', googleUrl(isbn13), { isbn13 })
  if (body === undefined) return undefined
  if (!isObject(body)) return lookupFailed(LABEL, isbn13, 'response is not an object')
  // Google leaves `items` out when nothing matched.
  if (body.items !== undefined && !Array.isArray(body.items)) {
    return lookupFailed(LABEL, isbn13, 'items is not an array')
  }
  return body
}

export const google: Source = {
  id: 'google',
  async lookupByIsbn(isbn13) {
    const body = await fetchBody(isbn13)
    if (!body) return undefined
    const results = list(body.items)
      .filter(isObject)
      .filter((volume) => isObject(volume.volumeInfo) && hasIsbn(volume.volumeInfo, isbn13))
      .flatMap((volume) => toResult(volume, isbn13, body) ?? [])
    // Stable: a volume with a cover first, otherwise Google's order.
    return results.sort(
      (a, b) => Number(b.coverUrl !== undefined) - Number(a.coverUrl !== undefined),
    )
  },
  async search(query) {
    const text = clean(query)
    if (!text) return []
    const failed = (reason: string): SearchHit[] => {
      sourceFailed(LABEL, 'search', { query: text }, reason)
      return []
    }
    const body = await getJson(LABEL, 'search', searchUrl(text), { query: text })
    // `getJson` has logged the failure; a search answers with a list either way.
    if (body === undefined) return []
    if (!isObject(body)) return failed('response is not an object')
    // Google leaves `items` out when nothing matched.
    if (body.items !== undefined && !Array.isArray(body.items))
      return failed('items is not an array')
    // One hit per ISBN-13 in Google's relevance order, the first volume winning, with a
    // missing `coverUrl` filled from a later duplicate — Finna's rule in `finnaSearchHits`.
    // No cover-first re-sort: unlike `lookupByIsbn`, these records are different books.
    const hits = new Map<string, SearchHit>()
    for (const volume of list(body.items).filter(isObject)) {
      const hit = toHit(volume)
      if (!hit) continue
      const seen = hits.get(hit.isbn13)
      if (!seen) hits.set(hit.isbn13, hit)
      // `??=` only when there is a URL: assigning `undefined` would add the key.
      else if (hit.coverUrl !== undefined) seen.coverUrl ??= hit.coverUrl
    }
    return [...hits.values()]
  },
}
