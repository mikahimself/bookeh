// Records live Finna and Google Books responses for the ISBNs in tests/fixtures/isbns.txt and
// writes tests/fixtures/REPORT.md (Story 3.2). Existing fixtures are never fetched again.
// Needs GOOGLE_BOOKS_API_KEY in .env. Run: npm run fixtures
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const FINNA_FIELDS = [
  'id',
  'recordPage',
  'formats',
  'title',
  'shortTitle',
  'subTitle',
  'titleSection',
  'uniformTitles',
  'authors',
  'primaryAuthors',
  'nonPresenterAuthors',
  'secondaryAuthors',
  'corporateAuthors',
  'isbns',
  'cleanIsbn',
  'languages',
  'originalLanguages',
  'publishers',
  'publicationDates',
  'placesOfPublication',
  'year',
  'edition',
  'physicalDescriptions',
  'series',
  'subjects',
  'subjectsExtended',
  'genres',
  'majorGenres',
  'classifications',
  'images',
  'imagesExtended',
  'summary',
  'sectors',
  'dedupIds',
  'fullRecord',
] as const

export const SOURCES = ['finna', 'google'] as const
export type Source = (typeof SOURCES)[number]

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
  reason: string
}

const TIMEOUT_MS = 20_000
const BACKOFF_MS = [2_000, 4_000, 8_000]
const REQUEST_GAP_MS = 1_000

// --- ISBNs -------------------------------------------------------------------------------

function isbn13CheckDigit(first12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10
}

/** ISBN-10 or ISBN-13, hyphens and spaces allowed, to ISBN-13; null when invalid. */
export function toIsbn13(text: string): string | null {
  const compact = text.replace(/[\s-]/g, '').toUpperCase()
  if (/^97[89]\d{10}$/.test(compact)) {
    return isbn13CheckDigit(compact.slice(0, 12)) === Number(compact[12]) ? compact : null
  }
  if (/^\d{9}[\dX]$/.test(compact)) {
    let sum = 0
    for (let i = 0; i < 10; i++) {
      sum += (compact[i] === 'X' ? 10 : Number(compact[i])) * (10 - i)
    }
    if (sum % 11 !== 0) return null
    const first12 = `978${compact.slice(0, 9)}`
    return `${first12}${isbn13CheckDigit(first12)}`
  }
  return null
}

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

// --- Requests ----------------------------------------------------------------------------

export function finnaUrl(isbn13: string): string {
  const params = new URLSearchParams({
    lookfor: `isbn:"${isbn13}"`,
    type: 'AllFields',
    limit: '100',
  })
  for (const field of FINNA_FIELDS) params.append('field[]', field)
  return `https://api.finna.fi/api/v1/search?${params}`
}

export function googleUrl(isbn13: string, key: string): string {
  const params = new URLSearchParams({ q: `isbn:${isbn13}`, key })
  return `https://www.googleapis.com/books/v1/volumes?${params}`
}

function retryable(status: number): boolean {
  return status === 429 || status >= 500
}

type Attempt = { ok: true; body: unknown } | { ok: false; reason: string; retry: boolean }

async function attempt(url: string, fetchFn: FetchFn): Promise<Attempt> {
  let response: Response
  try {
    response = await fetchFn(url, {
      headers: { Accept: 'application/json' },
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
): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  for (let i = 0; ; i++) {
    const result = await attempt(url, fetchFn)
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
  googleKey = '',
): Promise<{ requests: number; written: number; notCaptured: NotCaptured[] }> {
  const notCaptured: NotCaptured[] = []
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
      if (source === 'google' && googleDown) {
        notCaptured.push({ source, isbn13, reason: googleDown })
        continue
      }
      fetched = true
      const url = source === 'finna' ? finnaUrl(isbn13) : googleUrl(isbn13, googleKey)
      const result = await fetchJson(url, fetchFn, sleepFn)
      requests++
      if (!result.ok) {
        notCaptured.push({ source, isbn13, reason: result.reason })
        continue
      }
      const text = `${JSON.stringify(result.body, null, 2)}\n`
      if (googleKey && text.includes(googleKey)) {
        notCaptured.push({ source, isbn13, reason: 'response contains the API key' })
        continue
      }
      await writeFile(path, text)
      written++
      if (source === 'google') writtenGoogle.push(isbn13)
    }
    // About one request per second per source.
    if (fetched) await sleepFn(REQUEST_GAP_MS)
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

/** Finna `isbns` entries carry binding text after a space: `978-952-04-0805-3 kovakantinen`. */
function finnaIsbn(entry: string): string | null {
  const token = entry.trim().split(/\s+/)[0] ?? ''
  return toIsbn13(token)
}

/** The records whose `isbns` normalise to the ISBN asked for. Finna also returns other editions. */
export function finnaMatches(body: unknown, isbn13: string): Json[] {
  if (!isObject(body)) return []
  return list(body.records)
    .filter(isObject)
    .filter((record) => strings(record.isbns).some((entry) => finnaIsbn(entry) === isbn13))
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
  title: string
  categories: string[]
  subjects: string[]
  genres: string[]
}

async function readFixture(dir: string, source: Source, isbn13: string): Promise<unknown> {
  const path = fixturePath(dir, source, isbn13)
  if (!existsSync(path)) return undefined
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

const unique = (values: string[]): string[] => [...new Set(values)]

async function buildRow(dir: string, entry: ListedIsbn): Promise<Row> {
  const finnaBody = await readFixture(dir, 'finna', entry.isbn13)
  const googleBody = await readFixture(dir, 'google', entry.isbn13)
  const finna = finnaMatches(finnaBody, entry.isbn13)
  const google = googleMatches(googleBody, entry.isbn13)
  const titles = [...finna.map((r) => r.title), ...google.map((i) => volumeInfo(i).title)]
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
    title: strings(titles)[0] ?? '',
    categories: unique(google.flatMap((i) => strings(volumeInfo(i).categories))),
    subjects: unique(finna.flatMap(finnaSubjects)),
    genres: unique(finna.flatMap((r) => strings(r.genres))),
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

export async function buildReport(
  isbns: ListedIsbn[],
  dir: string,
  capturedOn: string,
  reasons: NotCaptured[] = [],
): Promise<{ markdown: string; missing: NotCaptured[] }> {
  const rows = await Promise.all(isbns.map((entry) => buildRow(dir, entry)))
  const total = rows.length
  const inFinna = rows.filter((r) => r.finna.matching > 0)
  const inGoogle = rows.filter((r) => r.google.matching > 0)
  const inBoth = rows.filter((r) => r.finna.matching > 0 && r.google.matching > 0)
  const inNeither = rows.filter((r) => r.finna.matching === 0 && r.google.matching === 0)
  const withCategories = rows.filter((r) => r.categories.length > 0)
  const withGenres = rows.filter((r) => r.genres.length > 0)
  const englishMissing = rows.filter((r) => /^978[01]/.test(r.isbn13) && r.google.matching === 0)

  const missing: NotCaptured[] = rows.flatMap((row) =>
    SOURCES.filter((source) => !row[source].captured).map((source) => ({
      source,
      isbn13: row.isbn13,
      reason:
        reasons.find((r) => r.source === source && r.isbn13 === row.isbn13)?.reason ??
        'no fixture on disk',
    })),
  )

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
    'Generated by `npm run fixtures` (`scripts/capture-fixtures.ts`) from the files in `finna/` and `google/`. Do not edit by hand.',
    '',
    `Captured: ${capturedOn}`,
    '',
    '## Requests',
    '',
    `- Finna: \`GET https://api.finna.fi/api/v1/search?lookfor=isbn:"<isbn13>"&type=AllFields&limit=100\` plus one \`field[]\` per field below`,
    '- Google Books: `GET https://www.googleapis.com/books/v1/volumes?q=isbn:<isbn13>&key=<key>`',
    '',
    `Finna fields: ${FINNA_FIELDS.map((f) => `\`${f}\``).join(', ')}`,
    '',
    'A match is a record whose own ISBNs normalise to the ISBN asked for: Finna `isbns` (binding text after a space ignored), Google `industryIdentifiers`. Covers and categories count matches only.',
    '',
    '## Books',
    '',
    '| As listed | ISBN-13 | Finna records / matching | Finna cover | Google items / matching | Google cover | Google categories | Title |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      [
        r.listed,
        r.isbn13,
        ...sourceCells(r.finna),
        ...sourceCells(r.google),
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
    `- Found by both: ${inBoth.length} of ${total}`,
    `- Found by neither: ${inNeither.length} of ${total} (${names(inNeither)})`,
    `- Covers: Finna ${rows.filter((r) => r.finna.cover).length}, Google ${rows.filter((r) => r.google.cover).length}`,
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
    '## Not captured',
    '',
    ...(missing.length ? missing.map((m) => `- ${m.source} ${m.isbn13}: ${m.reason}`) : ['- none']),
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

  const dir = fileURLToPath(new URL('../tests/fixtures/', import.meta.url))
  const reportPath = join(dir, 'REPORT.md')
  let isbns: ListedIsbn[]
  try {
    isbns = readIsbnList(await readFile(join(dir, 'isbns.txt'), 'utf8'))
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
    key,
  )

  // A run that wrote nothing keeps the date of the capture it reports on.
  const previous = existsSync(reportPath) ? await readFile(reportPath, 'utf8') : ''
  const today = new Date().toISOString().slice(0, 10)
  const capturedOn = written === 0 ? (/^Captured: (.+)$/m.exec(previous)?.[1] ?? today) : today

  const { markdown, missing } = await buildReport(isbns, dir, capturedOn, notCaptured)
  await writeFile(reportPath, markdown)
  process.stdout.write(`${requests} fixtures requested; report written to ${reportPath}\n`)
  for (const m of missing)
    process.stderr.write(`not captured: ${m.source} ${m.isbn13} (${m.reason})\n`)
  return missing.length > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
