// Finna, the first source (FR-11, AD-9). Core fields only; series and themes are Story 3.6.
import { toIsbn13 } from '@/fields/isbn'
import { logger } from '@/lib/errors'

import type { Source, SourceResult } from '../source'

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

const ORIGIN = 'https://api.finna.fi'
const TIMEOUT_MS = 10_000

export function finnaUrl(isbn13: string): string {
  const params = new URLSearchParams({
    lookfor: `isbn:"${isbn13}"`,
    type: 'AllFields',
    limit: '100',
  })
  for (const field of FINNA_FIELDS) params.append('field[]', field)
  return `${ORIGIN}/api/v1/search?${params}`
}

// --- Guards ------------------------------------------------------------------------------

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

/** NFC and trimmed; undefined for anything that is not a non-empty string. */
function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.normalize('NFC').trim() || undefined
}

/** `clean`, then trailing ISBD punctuation (`/ : ; = ,`) dropped: `Bazar :` gives `Bazar`. */
function cleanIsbd(value: unknown): string | undefined {
  return clean(clean(value)?.replace(/[\s/:;=,]+$/, ''))
}

// --- Matching ----------------------------------------------------------------------------

/** The `isbns` entry naming the ISBN asked for: `978-952-04-0805-3 kovakantinen`. */
function matchingIsbnEntry(record: Json, isbn13: string): string | undefined {
  return strings(record.isbns).find((entry) => {
    const token = entry.trim().split(/\s+/)[0] ?? ''
    return toIsbn13(token) === isbn13
  })
}

/** The records whose `isbns` normalise to the ISBN asked for. Finna also returns other editions. */
export function finnaMatches(body: unknown, isbn13: string): Json[] {
  if (!isObject(body)) return []
  return list(body.records)
    .filter(isObject)
    .filter((record) => matchingIsbnEntry(record, isbn13) !== undefined)
}

// --- Fields ------------------------------------------------------------------------------

const AUTHOR_ROLES = new Set(['kirjoittaja', 'tekijä', 'författare', 'author', 'aut'])

/** `Family, Given (qualifier)` to `Given Family`; a name without a comma is kept. */
function displayName(name: string): string | undefined {
  const bare = name.replace(/\s*\([^)]*\)\s*$/, '')
  const [family = '', given = ''] = bare.split(',').map((part) => part.trim())
  return clean(given ? `${given} ${family}` : family)
}

/**
 * Persons whose role names them as author, plus the first person when it has no role (the
 * MARC 100 main entry). Role-less added entries are translators in practice, so they are out.
 */
function authors(record: Json): SourceResult['authors'] {
  const persons = list(record.nonPresenterAuthors)
    .filter(isObject)
    .filter((entry) => entry.type == null || entry.type === 'Personal Name')
  const names = persons.flatMap((person, index) => {
    const name = clean(person.name)
    if (!name) return []
    const roles = (clean(person.role) ?? '')
      .split(',')
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean)
    const isAuthor = roles.length === 0 ? index === 0 : roles.some((r) => AUTHOR_ROLES.has(r))
    const display = isAuthor ? displayName(name) : undefined
    return display ? [display] : []
  })
  return [...new Set(names)].map((name) => ({ name }))
}

function year(record: Json): number | undefined {
  const value = record.year
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const digits = /\d{4}/.exec(String(value))
  return digits ? Number(digits[0]) : undefined
}

const NO_LANGUAGE = new Set(['und', 'mul', 'zxx', 'mis'])

/** MARC codes to BCP 47: `fin` gives `fi`, the bibliographic `ger` gives `de`. */
function language(record: Json): string | undefined {
  const code = clean(strings(record.languages)[0])
  if (!code) return undefined
  try {
    const tag = new Intl.Locale(code).language
    return tag && !NO_LANGUAGE.has(tag) ? tag : undefined
  } catch {
    return undefined
  }
}

const PAGE_WORD = /(?<!\p{L})(?:sivua|sivu|sidor|sid\.|pages|s\.|p\.)(?!\p{L})/iu

/** `222, [1] sivua ; 18 cm` gives 222; a duration such as `19 h 22 min` gives nothing. */
function pages(record: Json): number | undefined {
  const extent = strings(record.physicalDescriptions)[0]?.split(/ [:;]/)[0]
  if (!extent || !PAGE_WORD.test(extent)) return undefined
  const largest = Math.max(0, ...(extent.match(/\d+/g) ?? []).map(Number))
  return largest > 0 ? largest : undefined
}

function coverUrl(record: Json): string | undefined {
  const image = clean(strings(record.images)[0])
  if (!image) return undefined
  if (image.startsWith('/') && !image.startsWith('//')) return `${ORIGIN}${image}`
  if (image.startsWith('https:')) return image
  return undefined
}

/** The text after the ISBN in the matching entry, without enclosing parentheses. */
function binding(record: Json, isbn13: string): string | undefined {
  const rest = clean(matchingIsbnEntry(record, isbn13)?.trim().replace(/^\S+/, ''))
  return clean(rest?.replace(/^\((.*)\)$/, '$1'))
}

function toResult(record: Json, isbn13: string, body: unknown): SourceResult | undefined {
  const title = cleanIsbd(record.shortTitle) ?? cleanIsbd(record.title)
  if (!title) return undefined
  const result: SourceResult = {
    isbn13,
    title,
    subtitle: cleanIsbd(record.subTitle),
    authors: authors(record),
    publisher: cleanIsbd(strings(record.publishers)[0]),
    year: year(record),
    language: language(record),
    pages: pages(record),
    description: clean(strings(record.summary)[0]),
    subjects: [],
    themes: [],
    binding: binding(record, isbn13),
    coverUrl: coverUrl(record),
    source: 'finna',
    raw: { finna: body },
  }
  // A field the record does not have is left out, not sent as undefined.
  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined),
  ) as SourceResult
}

// --- Request -----------------------------------------------------------------------------

const timedOut = (err: unknown): boolean => err instanceof Error && err.name === 'TimeoutError'

/** The response body when it is a usable answer; undefined after logging why not. */
async function fetchBody(isbn13: string): Promise<Json | undefined> {
  const fail = (reason: string, err?: unknown, details?: Json): undefined => {
    logger().warn({ err, isbn13, ...details }, `Finna lookup failed: ${reason}`)
    return undefined
  }
  let response: Response
  try {
    response = await fetch(finnaUrl(isbn13), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    return fail(timedOut(err) ? 'timeout' : 'network error', err)
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    return fail(`HTTP ${response.status}`)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch (err) {
    // The timeout signal also covers reading the body.
    return fail(timedOut(err) ? 'timeout' : 'response is not JSON', err)
  }
  if (!isObject(body) || body.status !== 'OK') {
    const answer: Json = isObject(body) ? body : {}
    return fail('status is not OK', undefined, {
      status: answer.status,
      statusMessage: answer.statusMessage,
    })
  }
  // Finna leaves `records` out when nothing matched.
  if (body.records === undefined && body.resultCount === 0) return body
  if (!Array.isArray(body.records)) return fail('records is not an array')
  return body
}

export const finna: Source = {
  id: 'finna',
  async lookupByIsbn(isbn13) {
    const body = await fetchBody(isbn13)
    if (!body) return []
    const scored = finnaMatches(body, isbn13).flatMap((record) => {
      const result = toResult(record, isbn13, body)
      if (!result) return []
      const cover = result.coverUrl ? 1 : 0
      const subjects = list(record.subjects).length > 0 ? 1 : 0
      return [{ result, cover, subjects }]
    })
    // Stable: ties keep Finna's order.
    scored.sort((a, b) => b.cover - a.cover || b.subjects - a.subjects)
    return scored.map(({ result }) => result)
  },
}
