// Records live Finna, Google Books and Open Library responses for the ISBNs in
// tests/fixtures/isbns.txt, the Finna and Open Library search responses for the queries in
// tests/fixtures/queries.txt (Stories 8.3, 8.12), and writes tests/fixtures/REPORT.md
// (Story 3.2). Existing fixtures are never fetched again.
// Needs GOOGLE_BOOKS_API_KEY and OPEN_LIBRARY_CONTACT in .env. Run: npm run fixtures
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { toIsbn13 } from '@/fields/isbn'
import type { SourceResult } from '@/lib/metadata/source'
import {
  FINNA_FIELDS,
  FINNA_SEARCH_FIELDS,
  finnaMatches,
  finnaResults,
  finnaSearchHits,
  finnaSearchUrl,
  finnaUrl,
} from '@/lib/metadata/sources/finna'
import {
  OPEN_LIBRARY_FIELDS,
  openLibraryHeaders,
  openLibraryResults,
  openLibrarySearchHits,
  openLibrarySearchUrl,
  openLibraryUrl,
} from '@/lib/metadata/sources/openLibrary'

export const SOURCES = ['finna', 'google', 'openlibrary'] as const
export type Source = (typeof SOURCES)[number]

/** The sources whose `search` has fixtures; Google Books' search is not recorded. */
export const SEARCH_SOURCES = ['finna', 'openlibrary'] as const
export type SearchSource = (typeof SEARCH_SOURCES)[number]

/** What one source needs for one request. */
interface SourceRequest {
  url: string
  headers: Record<string, string>
}

export interface CaptureOptions {
  googleKey?: string
  /** `OPEN_LIBRARY_CONTACT`; empty leaves Open Library uncaptured rather than unidentified. */
  contact?: string
  queries?: readonly string[]
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>
export type SleepFn = (ms: number) => Promise<void>

export interface ListedIsbn {
  /** The line as written in isbns.txt. */
  listed: string
  isbn13: string
}

export interface NotCaptured {
  source: Source
  isbn13: string
  /** Set instead of `isbn13` for a search fixture. */
  query?: string
  reason: string
}

const TIMEOUT_MS = 20_000
const BACKOFF_MS = [2_000, 4_000, 8_000]
const REQUEST_GAP_MS = 1_000

// --- ISBNs -------------------------------------------------------------------------------

/** Parses isbns.txt: one ISBN per line, blank lines and `#` comments skipped. */
export function readIsbnList(text: string): ListedIsbn[] {
  const result: ListedIsbn[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const listed = raw.replace(/#.*$/, '').trim()
    if (!listed) return
    const isbn13 = toIsbn13(listed)
    if (!isbn13) throw new Error(`isbns.txt line ${index + 1}: "${listed}" is not a valid ISBN`)
    result.push({ listed, isbn13 })
  })
  return result
}

// --- Queries -----------------------------------------------------------------------------

/** Parses queries.txt: one search query per line, blank lines and `#` comments skipped. */
export function readQueryList(text: string): string[] {
  const queries: string[] = []
  // The fixture is keyed on the slug, so two queries must not share one.
  const slugs = new Map<string, string>()
  text.split(/\r?\n/).forEach((raw, index) => {
    const query = raw.replace(/#.*$/, '').trim().replace(/\s+/g, ' ')
    if (!query) return
    const slug = querySlug(query)
    if (!slug) {
      throw new Error(`queries.txt line ${index + 1}: "${query}" has no usable file name`)
    }
    const taken = slugs.get(slug)
    if (taken !== undefined) {
      throw new Error(
        `queries.txt line ${index + 1}: "${query}" has the same fixture as "${taken}" (${slug}.json)`,
      )
    }
    slugs.set(slug, query)
    queries.push(query)
  })
  return queries
}

/** The query's fixture file name, without extension: `Harari, Yuval` gives `harari-yuval`. */
export function querySlug(query: string): string {
  return query
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function searchFixturePath(dir: string, source: SearchSource, query: string): string {
  return join(dir, source, 'search', `${querySlug(query)}.json`)
}

// --- Requests ----------------------------------------------------------------------------

export function googleUrl(isbn13: string, key: string): string {
  const params = new URLSearchParams({ q: `isbn:${isbn13}`, key })
  return `https://www.googleapis.com/books/v1/volumes?${params}`
}

/** The lookup request for one source: Google carries its key, Open Library its User-Agent. */
function lookupRequest(
  source: Source,
  isbn13: string,
  googleKey: string,
  openLibrary: Record<string, string>,
): SourceRequest {
  if (source === 'finna') return { url: finnaUrl(isbn13), headers: {} }
  if (source === 'google') return { url: googleUrl(isbn13, googleKey), headers: {} }
  return { url: openLibraryUrl(isbn13), headers: openLibrary }
}

function searchRequest(
  source: SearchSource,
  query: string,
  openLibrary: Record<string, string>,
): SourceRequest {
  return source === 'finna'
    ? { url: finnaSearchUrl(query), headers: {} }
    : { url: openLibrarySearchUrl(query), headers: openLibrary }
}

function retryable(status: number): boolean {
  return status === 429 || status >= 500
}

type Attempt = { ok: true; body: unknown } | { ok: false; reason: string; retry: boolean }

async function attempt(
  url: string,
  fetchFn: FetchFn,
  headers: Record<string, string> = {},
): Promise<Attempt> {
  let response: Response
  try {
    response = await fetchFn(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error'
    return { ok: false, reason: name === 'TimeoutError' ? 'timeout' : 'network error', retry: true }
  }
  if (!response.ok) {
    return { ok: false, reason: `HTTP ${response.status}`, retry: retryable(response.status) }
  }
  try {
    return { ok: true, body: await response.json() }
  } catch (error) {
    // The timeout signal also covers reading the body.
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { ok: false, reason: 'timeout', retry: true }
    }
    return { ok: false, reason: 'response is not JSON', retry: false }
  }
}

async function fetchJson(
  url: string,
  fetchFn: FetchFn,
  sleepFn: SleepFn,
  headers: Record<string, string> = {},
): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  for (let i = 0; ; i++) {
    const result = await attempt(url, fetchFn, headers)
    if (result.ok) return result
    if (!result.retry || i >= BACKOFF_MS.length) {
      const tries = i + 1
      return { ok: false, reason: `${result.reason} (${tries} attempt${tries > 1 ? 's' : ''})` }
    }
    await sleepFn(BACKOFF_MS[i])
  }
}

export function fixturePath(dir: string, source: Source, isbn13: string): string {
  return join(dir, source, `${isbn13}.json`)
}

/**
 * A book Google certainly knows (Penguin Classics). While Google is degraded its `isbn:` search
 * answers 503 or a spurious `totalItems: 0`, which no single response tells apart from a real
 * miss, so Google is captured only in a run where this ISBN is found.
 */
export const GOOGLE_HEALTH_ISBN = '9780141439518'

/** Null when Google finds GOOGLE_HEALTH_ISBN, otherwise why not. */
async function googleHealth(
  key: string,
  fetchFn: FetchFn,
  sleepFn: SleepFn,
): Promise<string | null> {
  const health = await fetchJson(googleUrl(GOOGLE_HEALTH_ISBN, key), fetchFn, sleepFn)
  if (!health.ok) return `Google health check failed: ${health.reason}`
  if (googleMatches(health.body, GOOGLE_HEALTH_ISBN).length === 0) {
    return `Google health check failed: no match for ${GOOGLE_HEALTH_ISBN}`
  }
  return null
}

/**
 * Fetches every missing fixture, sequentially, and writes successful responses unchanged.
 * Failures are reported, never written. Google is checked before and, when this run wrote any
 * Google file, again after the loop; a failed second check removes this run's Google files.
 */
export async function capture(
  isbns: readonly string[],
  dir: string,
  fetchFn: FetchFn,
  sleepFn: SleepFn,
  { googleKey = '', contact = '', queries = [] }: CaptureOptions = {},
): Promise<{ requests: number; written: number; notCaptured: NotCaptured[] }> {
  const notCaptured: NotCaptured[] = []
  const openLibrary = openLibraryHeaders({ OPEN_LIBRARY_CONTACT: contact })
  const noContact = contact ? null : 'OPEN_LIBRARY_CONTACT is not set'
  /** The secrets that must never reach a fixture file, on either write path. */
  const secrets: [string, string][] = [
    [googleKey, 'the API key'],
    [contact, 'the contact'],
  ]
  const leaks = (text: string): string | undefined =>
    secrets.find(([secret]) => secret && text.includes(secret))?.[1]
  const writtenGoogle: string[] = []
  let requests = 0
  let written = 0
  for (const source of SOURCES) await mkdir(join(dir, source), { recursive: true })

  let googleDown: string | null = null
  if (isbns.some((isbn13) => !existsSync(fixturePath(dir, 'google', isbn13)))) {
    googleDown = await googleHealth(googleKey, fetchFn, sleepFn)
    requests++
  }

  for (const isbn13 of isbns) {
    let fetched = false
    for (const source of SOURCES) {
      const path = fixturePath(dir, source, isbn13)
      if (existsSync(path)) continue
      const blocked = source === 'google' ? googleDown : source === 'openlibrary' ? noContact : null
      if (blocked) {
        notCaptured.push({ source, isbn13, reason: blocked })
        continue
      }
      fetched = true
      const { url, headers } = lookupRequest(source, isbn13, googleKey, openLibrary)
      const result = await fetchJson(url, fetchFn, sleepFn, headers)
      requests++
      if (!result.ok) {
        notCaptured.push({ source, isbn13, reason: result.reason })
        continue
      }
      const text = `${JSON.stringify(result.body, null, 2)}\n`
      const leak = leaks(text)
      if (leak) {
        notCaptured.push({ source, isbn13, reason: `response contains ${leak}` })
        continue
      }
      await writeFile(path, text)
      written++
      if (source === 'google') writtenGoogle.push(isbn13)
    }
    // About one request per second per source.
    if (fetched) await sleepFn(REQUEST_GAP_MS)
  }

  // Search: one fixture per query per searching source, under the same rules.
  if (queries.length > 0) {
    for (const source of SEARCH_SOURCES) {
      await mkdir(join(dir, source, 'search'), { recursive: true })
    }
  }
  for (const query of queries) {
    for (const source of SEARCH_SOURCES) {
      const path = searchFixturePath(dir, source, query)
      if (existsSync(path)) continue
      if (source === 'openlibrary' && noContact) {
        notCaptured.push({ source, isbn13: '', query, reason: noContact })
        continue
      }
      const { url, headers } = searchRequest(source, query, openLibrary)
      const result = await fetchJson(url, fetchFn, sleepFn, headers)
      requests++
      if (!result.ok) {
        notCaptured.push({ source, isbn13: '', query, reason: result.reason })
      } else {
        const text = `${JSON.stringify(result.body, null, 2)}\n`
        const leak = leaks(text)
        if (leak) {
          notCaptured.push({ source, isbn13: '', query, reason: `response contains ${leak}` })
        } else {
          await writeFile(path, text)
          written++
        }
      }
      await sleepFn(REQUEST_GAP_MS)
    }
  }

  // Google can degrade after the first check; a spurious 0 must not become a fixture.
  if (writtenGoogle.length > 0) {
    const down = await googleHealth(googleKey, fetchFn, sleepFn)
    requests++
    if (down) {
      for (const isbn13 of writtenGoogle) {
        await rm(fixturePath(dir, 'google', isbn13))
        notCaptured.push({ source: 'google', isbn13, reason: down })
      }
      written -= writtenGoogle.length
    }
  }
  return { requests, written, notCaptured }
}

// --- Matching (what the report counts) ---------------------------------------------------

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function strings(value: unknown): string[] {
  return list(value).filter((v): v is string => typeof v === 'string')
}

/** The volumes whose industry identifiers normalise to the ISBN asked for. */
export function googleMatches(body: unknown, isbn13: string): Json[] {
  if (!isObject(body)) return []
  return list(body.items)
    .filter(isObject)
    .filter((item) => {
      const info = isObject(item.volumeInfo) ? item.volumeInfo : {}
      return list(info.industryIdentifiers)
        .filter(isObject)
        .some((id) => typeof id.identifier === 'string' && toIsbn13(id.identifier) === isbn13)
    })
}

function volumeInfo(item: Json): Json {
  return isObject(item.volumeInfo) ? item.volumeInfo : {}
}

/** The Open Library entry for the ISBN asked for: `[entry]` or `[]` (`{}`, or another key). */
export function openLibraryMatches(body: unknown, isbn13: string): Json[] {
  if (!isObject(body)) return []
  const entry = body[`ISBN:${isbn13}`]
  return isObject(entry) ? [entry] : []
}

/** `[{ name }]` entries with a name, as the adapter reads them. */
function subjectNames(value: unknown): string[] {
  return list(value)
    .filter(isObject)
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === 'string' && name.trim() !== '')
}

/** Finna subjects are lists of parts (`["Bellegueule, Eddy", "(fiktiivinen hahmo)"]`). */
function finnaSubjects(record: Json): string[] {
  return list(record.subjects)
    .map((parts) => strings(parts).join(' '))
    .filter(Boolean)
}

// --- Report ------------------------------------------------------------------------------

interface SourceRow {
  captured: boolean
  total: number
  matching: number
  cover: boolean
}

interface Row extends ListedIsbn {
  finna: SourceRow
  google: SourceRow
  openlibrary: SourceRow
  title: string
  categories: string[]
  subjects: string[]
  genres: string[]
  openLibrarySubjects: string[]
  /** Fields Open Library has that neither Finna nor Google Books gives for this ISBN. */
  openLibraryAdds: string[]
}

async function readFixture(dir: string, source: Source, isbn13: string): Promise<unknown> {
  const path = fixturePath(dir, source, isbn13)
  if (!existsSync(path)) return undefined
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

const unique = (values: string[]): string[] => [...new Set(values)]

/** The `SourceResult` fields compared between the sources, and how Google states each one. */
const COMPARED: [keyof SourceResult, (info: Json) => boolean][] = [
  ['authors', (info) => strings(info.authors).length > 0],
  ['publisher', (info) => typeof info.publisher === 'string'],
  ['year', (info) => typeof info.publishedDate === 'string'],
  ['pages', (info) => typeof info.pageCount === 'number'],
  ['subtitle', (info) => typeof info.subtitle === 'string'],
  ['subjects', (info) => strings(info.categories).length > 0],
]

const filled = (result: SourceResult, field: keyof SourceResult): boolean => {
  const value = result[field]
  return Array.isArray(value) ? value.length > 0 : value !== undefined
}

/**
 * The fields the Open Library record fills that no Finna or Google match for this ISBN does —
 * what the third source actually adds. Finna and Open Library are compared through their own
 * parsers, Google through its raw volume fields.
 */
function openLibraryAdds(
  openlibrary: SourceResult | undefined,
  finna: SourceResult[],
  google: Json[],
): string[] {
  if (!openlibrary) return []
  return COMPARED.filter(
    ([field, inGoogle]) =>
      filled(openlibrary, field) &&
      !finna.some((result) => filled(result, field)) &&
      !google.some((item) => inGoogle(volumeInfo(item))),
  ).map(([field]) => field)
}

async function buildRow(dir: string, entry: ListedIsbn): Promise<Row> {
  const finnaBody = await readFixture(dir, 'finna', entry.isbn13)
  const googleBody = await readFixture(dir, 'google', entry.isbn13)
  const openLibraryBody = await readFixture(dir, 'openlibrary', entry.isbn13)
  const finna = finnaMatches(finnaBody, entry.isbn13)
  const google = googleMatches(googleBody, entry.isbn13)
  const openlibrary = openLibraryMatches(openLibraryBody, entry.isbn13)
  const parsed = {
    finna: finnaResults(finnaBody, entry.isbn13) ?? [],
    openlibrary: openLibraryResults(openLibraryBody, entry.isbn13) ?? [],
  }
  const titles = [
    ...finna.map((r) => r.title),
    ...google.map((i) => volumeInfo(i).title),
    ...openlibrary.map((e) => e.title),
  ]
  return {
    ...entry,
    finna: {
      captured: finnaBody !== undefined,
      total:
        isObject(finnaBody) && typeof finnaBody.resultCount === 'number'
          ? finnaBody.resultCount
          : 0,
      matching: finna.length,
      cover: finna.some((r) => list(r.images).length > 0),
    },
    google: {
      captured: googleBody !== undefined,
      total:
        isObject(googleBody) && typeof googleBody.totalItems === 'number'
          ? googleBody.totalItems
          : 0,
      matching: google.length,
      cover: google.some((i) => isObject(volumeInfo(i).imageLinks)),
    },
    openlibrary: {
      captured: openLibraryBody !== undefined,
      total: isObject(openLibraryBody) ? Object.keys(openLibraryBody).length : 0,
      matching: openlibrary.length,
      // Recorded for the report only: the adapter sets no coverUrl (AD-14, redirects).
      cover: openlibrary.some((e) => isObject(e.cover)),
    },
    title: strings(titles)[0] ?? '',
    categories: unique(google.flatMap((i) => strings(volumeInfo(i).categories))),
    subjects: unique(finna.flatMap(finnaSubjects)),
    genres: unique(finna.flatMap((r) => strings(r.genres))),
    openLibrarySubjects: unique(openlibrary.flatMap((e) => subjectNames(e.subjects))),
    openLibraryAdds: openLibraryAdds(parsed.openlibrary[0], parsed.finna, google),
  }
}

/** Counts how many books carry each term, most common first. */
function tally(rows: Row[], pick: (row: Row) => string[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const row of rows)
    for (const term of pick(row)) counts.set(term, (counts.get(term) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fi'))
}

const cell = (text: string): string => text.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\|/g, '\\|')
const yes = (value: boolean): string => (value ? 'yes' : '–')

function sourceCells(row: SourceRow): [string, string] {
  if (!row.captured) return ['not captured', '–']
  return [`${row.total} / ${row.matching}`, yes(row.cover)]
}

interface QueryRow {
  query: string
  source: SearchSource
  slug: string
  captured: boolean
  records: number
  hits: number
}

async function buildQueryRow(dir: string, source: SearchSource, query: string): Promise<QueryRow> {
  const path = searchFixturePath(dir, source, query)
  const body: unknown = existsSync(path)
    ? (JSON.parse(await readFile(path, 'utf8')) as unknown)
    : undefined
  const records = isObject(body) ? (source === 'finna' ? body.records : body.docs) : undefined
  const hits =
    body === undefined
      ? 0
      : source === 'finna'
        ? finnaSearchHits(body, query).length
        : openLibrarySearchHits(body, query).length
  return {
    query,
    source,
    slug: querySlug(query),
    captured: body !== undefined,
    records: list(records).length,
    hits,
  }
}

export async function buildReport(
  isbns: ListedIsbn[],
  dir: string,
  capturedOn: string,
  reasons: NotCaptured[] = [],
  queries: readonly string[] = [],
): Promise<{ markdown: string; missing: NotCaptured[] }> {
  const rows = await Promise.all(isbns.map((entry) => buildRow(dir, entry)))
  const queryRows = await Promise.all(
    queries.flatMap((query) => SEARCH_SOURCES.map((source) => buildQueryRow(dir, source, query))),
  )
  const total = rows.length
  const inFinna = rows.filter((r) => r.finna.matching > 0)
  const inGoogle = rows.filter((r) => r.google.matching > 0)
  const inOpenLibrary = rows.filter((r) => r.openlibrary.matching > 0)
  const inBoth = rows.filter((r) => r.finna.matching > 0 && r.google.matching > 0)
  const inNeither = rows.filter((r) => SOURCES.every((source) => r[source].matching === 0))
  const withCategories = rows.filter((r) => r.categories.length > 0)
  const withGenres = rows.filter((r) => r.genres.length > 0)
  const englishMissing = rows.filter((r) => /^978[01]/.test(r.isbn13) && r.google.matching === 0)

  const missing: NotCaptured[] = [
    ...rows.flatMap((row) =>
      SOURCES.filter((source) => !row[source].captured).map((source) => ({
        source,
        isbn13: row.isbn13,
        reason:
          reasons.find((r) => r.source === source && r.isbn13 === row.isbn13)?.reason ??
          'no fixture on disk',
      })),
    ),
    ...queryRows
      .filter((row) => !row.captured)
      .map((row) => ({
        source: row.source as Source,
        isbn13: '',
        query: row.query,
        reason:
          reasons.find((r) => r.query === row.query && r.source === row.source)?.reason ??
          'no fixture on disk',
      })),
  ]

  const half = withCategories.length * 2 >= total
  const googleMissing = rows.filter((r) => !r.google.captured).length
  const d2 =
    googleMissing > 0
      ? [
          `Not decided: ${googleMissing} of ${total} Google responses are not captured. Run \`npm run fixtures\` again once Google answers.`,
        ]
      : [
          `Google categories cover ${withCategories.length} of ${total} books.`,
          half
            ? 'That is at least half, so Epic 9 maps Google categories only.'
            : 'That is under half, so Epic 9 also maps Finna genre terms (Story 9.11).',
        ]
  if (googleMissing === 0 && englishMissing.length > 0) {
    d2.push(
      `The Google side was captured while Google was degraded: it has no match for ${englishMissing.length} English-language edition${englishMissing.length > 1 ? 's' : ''} it should know (${englishMissing.map((r) => r.isbn13).join(', ')}), so its coverage here is a lower bound.`,
    )
  }
  if (googleMissing === 0 && missing.length > 0) {
    d2.push(
      `${missing.length} response${missing.length > 1 ? 's are' : ' is'} not captured, so the result is provisional.`,
    )
  }

  const uncaptured = (source: Source): string => {
    const n = rows.filter((r) => !r[source].captured).length
    return n > 0 ? ` (${n} not captured)` : ''
  }
  const terms = (pairs: [string, number][]): string[] =>
    pairs.length ? pairs.map(([term, n]) => `- ${term} (${n})`) : ['- none']
  const names = (subset: Row[]): string =>
    subset.length
      ? subset.map((r) => `${r.isbn13}${r.title ? ` ${r.title}` : ''}`).join('; ')
      : 'none'

  const lines = [
    '# Real-book fixtures',
    '',
    'Generated by `npm run fixtures` (`scripts/capture-fixtures.ts`) from the files in `finna/`, `google/` and `openlibrary/`. Do not edit by hand.',
    '',
    `Captured: ${capturedOn}`,
    '',
    '## Requests',
    '',
    `- Finna: \`GET https://api.finna.fi/api/v1/search?lookfor=isbn:"<isbn13>"&type=AllFields&limit=100\` plus one \`field[]\` per field below`,
    '- Google Books: `GET https://www.googleapis.com/books/v1/volumes?q=isbn:<isbn13>&key=<key>`',
    '- Open Library: `GET https://openlibrary.org/api/books?bibkeys=ISBN:<isbn13>&jscmd=data&format=json`',
    `- Finna search: \`GET https://api.finna.fi/api/v1/search?lookfor=<query>&type=AllFields&limit=20\` plus one \`field[]\` per search field below`,
    '- Open Library search: `GET https://openlibrary.org/search.json?q=<query>&fields=<fields below>&limit=20`',
    '',
    'Every Open Library request carries `User-Agent: bookeh (<contact>)` from `OPEN_LIBRARY_CONTACT`; the contact itself is never written here.',
    '',
    `Finna fields: ${FINNA_FIELDS.map((f) => `\`${f}\``).join(', ')}`,
    '',
    `Finna search fields: ${FINNA_SEARCH_FIELDS.map((f) => `\`${f}\``).join(', ')}`,
    '',
    `Open Library search fields: ${OPEN_LIBRARY_FIELDS.map((f) => `\`${f}\``).join(', ')}`,
    '',
    'A match is a record whose own ISBNs normalise to the ISBN asked for: Finna `isbns` (binding text after a space ignored), Google `industryIdentifiers`, Open Library the `ISBN:<isbn13>` key it answered under. Covers and categories count matches only. Open Library covers are recorded here but never used: those URLs redirect, which AD-14 refuses.',
    '',
    '## Books',
    '',
    '| As listed | ISBN-13 | Finna records / matching | Finna cover | Google items / matching | Google cover | OL keys / matching | OL cover | OL adds | Google categories | Title |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      [
        r.listed,
        r.isbn13,
        ...sourceCells(r.finna),
        ...sourceCells(r.google),
        ...sourceCells(r.openlibrary),
        r.openLibraryAdds.join('; ') || '–',
        r.categories.join('; ') || '–',
        r.title || '–',
      ]
        .map(cell)
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    ),
    '',
    '## Totals',
    '',
    `- Found by Finna: ${inFinna.length} of ${total}${uncaptured('finna')}`,
    `- Found by Google: ${inGoogle.length} of ${total}${uncaptured('google')}`,
    `- Found by Open Library: ${inOpenLibrary.length} of ${total}${uncaptured('openlibrary')}`,
    `- Found by Finna and Google both: ${inBoth.length} of ${total}`,
    `- Found by no source: ${inNeither.length} of ${total} (${names(inNeither)})`,
    `- Covers: Finna ${rows.filter((r) => r.finna.cover).length}, Google ${rows.filter((r) => r.google.cover).length}, Open Library ${rows.filter((r) => r.openlibrary.cover).length} (unused)`,
    `- Books where Open Library adds a field the other two leave empty: ${rows.filter((r) => r.openLibraryAdds.length > 0).length} (${tally(
      rows,
      (r) => r.openLibraryAdds,
    )
      .map(([field, n]) => `${field} ${n}`)
      .join(', ')})`,
    `- Google results with \`categories\`: ${withCategories.length}`,
    `- Finna results with \`genres\`: ${withGenres.length}`,
    '',
    '## Finna subjects (themes), top 25',
    '',
    ...terms(tally(rows, (r) => r.subjects).slice(0, 25)),
    '',
    '## Finna genre terms',
    '',
    ...terms(tally(rows, (r) => r.genres)),
    '',
    '## Google categories',
    '',
    ...terms(tally(rows, (r) => r.categories)),
    '',
    '## Open Library subjects',
    '',
    ...terms(tally(rows, (r) => r.openLibrarySubjects)),
    '',
    '## Search queries',
    '',
    "Recorded under `<source>/search/<slug>.json`. Records are Finna `records` or Open Library `docs` (works); hits are the distinct ISBN-13s the response yields — for Open Library, from each work's edition docs only.",
    '',
    '| Query | Source | Fixture | Records | Hits |',
    '|---|---|---|---|---|',
    ...(queryRows.length
      ? queryRows.map((row) =>
          [
            row.query,
            row.source,
            row.captured ? `${row.slug}.json` : 'not captured',
            row.captured ? String(row.records) : '–',
            row.captured ? String(row.hits) : '–',
          ]
            .map(cell)
            .join(' | ')
            .replace(/^/, '| ')
            .replace(/$/, ' |'),
        )
      : ['| none | – | – | – | – |']),
    '',
    '## Not captured',
    '',
    ...(missing.length
      ? missing.map((m) => `- ${m.source} ${m.query ?? m.isbn13}: ${m.reason}`)
      : ['- none']),
    '',
    '## D-2 checkpoint',
    '',
    d2.join(' '),
    '',
  ]
  return { markdown: lines.join('\n'), missing }
}

// --- Entry point -------------------------------------------------------------------------

async function main(): Promise<number> {
  await import('dotenv/config')
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim()
  if (!key) {
    process.stderr.write(
      'GOOGLE_BOOKS_API_KEY is not set in .env. Keyless calls hit the shared quota.\n',
    )
    return 1
  }
  // Open Library asks every client to identify itself, so without a contact it is skipped
  // rather than asked unidentified; Finna and Google are captured either way.
  const contact = process.env.OPEN_LIBRARY_CONTACT?.trim() ?? ''
  if (!contact) {
    process.stderr.write(
      'OPEN_LIBRARY_CONTACT is not set in .env; skipping Open Library (it asks every client to identify itself).\n',
    )
  }

  const dir = fileURLToPath(new URL('../tests/fixtures/', import.meta.url))
  const reportPath = join(dir, 'REPORT.md')
  let isbns: ListedIsbn[]
  let queries: string[]
  try {
    isbns = readIsbnList(await readFile(join(dir, 'isbns.txt'), 'utf8'))
    queries = readQueryList(await readFile(join(dir, 'queries.txt'), 'utf8'))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }

  const sleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const loggingFetch: FetchFn = (url, init) => {
    process.stdout.write(
      `GET ${url.replace(encodeURIComponent(key), '<key>').replace(/&field%5B%5D=[^&]*/g, '')}\n`,
    )
    return fetch(url, init)
  }
  const { requests, written, notCaptured } = await capture(
    isbns.map((i) => i.isbn13),
    dir,
    loggingFetch,
    sleep,
    { googleKey: key, contact, queries },
  )

  // A run that wrote nothing keeps the date of the capture it reports on.
  const previous = existsSync(reportPath) ? await readFile(reportPath, 'utf8') : ''
  const today = new Date().toISOString().slice(0, 10)
  const capturedOn = written === 0 ? (/^Captured: (.+)$/m.exec(previous)?.[1] ?? today) : today

  const { markdown, missing } = await buildReport(isbns, dir, capturedOn, notCaptured, queries)
  await writeFile(reportPath, markdown)
  process.stdout.write(`${requests} fixtures requested; report written to ${reportPath}\n`)
  for (const m of missing)
    process.stderr.write(`not captured: ${m.source} ${m.query ?? m.isbn13} (${m.reason})\n`)
  return missing.length > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
