// Finna, the first source (FR-11, AD-9): core fields, series, themes (FR-17a) and author sort names.
import { toIsbn13 } from '@/fields/isbn'

import type { Source, SourceResult } from '../source'
import {
  clean,
  compact,
  getJson,
  isObject,
  isoLanguage,
  list,
  lookupFailed,
  strings,
  type Json,
} from './shared'

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
const LABEL = 'Finna'

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

const QUALIFIER = /\s*\([^)]*\)\s*$/

/** `Family, Given (qualifier)` split into its parts, the qualifier dropped. */
function nameParts(name: string): { family: string; given: string } {
  const [family = '', given = ''] = name
    .replace(QUALIFIER, '')
    .split(',')
    .map((part) => part.trim())
  return { family, given }
}

/** `Family, Given (qualifier)` to `Given Family`; a name without a comma is kept. */
function displayName(name: string): string | undefined {
  const { family, given } = nameParts(name)
  return clean(given ? `${given} ${family}` : family)
}

/** `Family, Given (qualifier)` to `Family, Given`; nothing for a name that is not inverted. */
function sortName(name: string): string | undefined {
  const { family, given } = nameParts(name)
  return family && given ? clean(`${family}, ${given}`) : undefined
}

/**
 * Persons whose role names them as author, plus the first person when it has no role (the
 * MARC 100 main entry). Role-less added entries are translators in practice, so they are out.
 */
function authors(record: Json): SourceResult['authors'] {
  const persons = list(record.nonPresenterAuthors)
    .filter(isObject)
    .filter((entry) => entry.type == null || entry.type === 'Personal Name')
  const byName = new Map<string, SourceResult['authors'][number]>()
  persons.forEach((person, index) => {
    const name = clean(person.name)
    if (!name) return
    const roles = (clean(person.role) ?? '')
      .split(',')
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean)
    const isAuthor = roles.length === 0 ? index === 0 : roles.some((r) => AUTHOR_ROLES.has(r))
    const display = isAuthor ? displayName(name) : undefined
    if (!display || byName.has(display)) return
    const sort = sortName(name)
    byName.set(display, sort ? { name: display, sortName: sort } : { name: display })
  })
  return [...byName.values()]
}

const SERIES_NUMBER = /\d+(?:[.,]\d+)?/
/** As `QUALIFIER`, also before a closing full stop: `Keltainen kirjasto (sarja).` */
const SERIES_QUALIFIER = /\s*\([^)]*\)\.?\s*$/

/**
 * The first entry with a number, else the first entry: an unnumbered entry ahead of a numbered
 * one is usually a paperback imprint (`Keltainen pokkari`). `book 5.` gives 5, `2,5` gives 2.5.
 */
function series(record: Json): Pick<SourceResult, 'series' | 'seriesIndex'> {
  const entries = list(record.series)
    .filter(isObject)
    .flatMap((entry) => {
      const name = cleanIsbd(cleanIsbd(entry.name)?.replace(SERIES_QUALIFIER, ''))
      if (!name) return []
      const number =
        typeof entry.additional === 'string' ? SERIES_NUMBER.exec(entry.additional) : null
      return [{ name, index: number ? Number(number[0].replace(',', '.')) : undefined }]
    })
  const pick = entries.find(({ index }) => index !== undefined) ?? entries[0]
  return pick ? { series: pick.name, seriesIndex: pick.index } : {}
}

/**
 * Each `subjects` heading as given, joined with a space after dropping the MARC separator that
 * closes each part. A `(qualifier)` inside a part counts as a part of its own, so
 * `["Stark,", "suku, (fiktiivinen hahmo)."]` gives `Stark suku (fiktiivinen hahmo).`.
 */
function themes(record: Json): string[] {
  const headings = list(record.subjects).flatMap((heading) => {
    const parts = strings(heading)
      .flatMap((part) => part.split(/\s+(?=\()/))
      .flatMap((part) => cleanIsbd(part) ?? [])
      // Preliminary (CIP) records mark every heading with this part.
      .filter((part) => part !== 'ENNAKKOTIETO')
    return clean(parts.join(' ')) ?? []
  })
  return [...new Set(headings)]
}

function year(record: Json): number | undefined {
  const value = record.year
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const digits = /\d{4}/.exec(String(value))
  return digits ? Number(digits[0]) : undefined
}

/** MARC codes to BCP 47: `fin` gives `fi`, the bibliographic `ger` gives `de`. */
function language(record: Json): string | undefined {
  return isoLanguage(strings(record.languages)[0])
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
    ...series(record),
    publisher: cleanIsbd(strings(record.publishers)[0]),
    year: year(record),
    language: language(record),
    pages: pages(record),
    description: clean(strings(record.summary)[0]),
    subjects: [],
    themes: themes(record),
    binding: binding(record, isbn13),
    coverUrl: coverUrl(record),
    source: 'finna',
    raw: { finna: body },
  }
  return compact(result)
}

// --- Parsing -----------------------------------------------------------------------------

/**
 * The results of a Finna response body for `isbn13`, best first: records with
 * a cover, then records with themes, ties in Finna's order. `undefined`, after
 * one logged warning, when the body is not a usable answer (status not `OK`,
 * or `records` neither an array nor left out for no match). Shared with the
 * fixture source, which serves captured Finna responses.
 */
export function finnaResults(body: unknown, isbn13: string): SourceResult[] | undefined {
  if (!isObject(body) || body.status !== 'OK') {
    const answer: Json = isObject(body) ? body : {}
    return lookupFailed(LABEL, isbn13, 'status is not OK', {
      status: answer.status,
      statusMessage: answer.statusMessage,
    })
  }
  // Finna leaves `records` out when nothing matched.
  const noMatch = body.records === undefined && body.resultCount === 0
  if (!noMatch && !Array.isArray(body.records)) {
    return lookupFailed(LABEL, isbn13, 'records is not an array')
  }
  const scored = finnaMatches(body, isbn13).flatMap((record) => {
    const result = toResult(record, isbn13, body)
    if (!result) return []
    const cover = result.coverUrl ? 1 : 0
    const themed = result.themes.length > 0 ? 1 : 0
    return [{ result, cover, themed }]
  })
  // Stable: ties keep Finna's order.
  scored.sort((a, b) => b.cover - a.cover || b.themed - a.themed)
  return scored.map(({ result }) => result)
}

export const finna: Source = {
  id: 'finna',
  async lookupByIsbn(isbn13) {
    const body = await getJson(LABEL, finnaUrl(isbn13), isbn13)
    if (body === undefined) return undefined
    return finnaResults(body, isbn13)
  },
}
