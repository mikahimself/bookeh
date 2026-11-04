import { logger } from '@/lib/errors'

import type { SourceResult } from '../source'
import { clean, isObject, list, lookupFailed } from './shared'

const ENDPOINT = 'https://ldf.fi/kirjasampo/sparql'
const LABEL = 'Kirjasampo'

/** Every placement of separators between digits, including the unhyphenated form. */
function hyphenations(isbn: string): string[] {
  const forms = ['']
  for (const char of isbn) {
    const next: string[] = []
    for (const form of forms) {
      next.push(form + char)
      if (form) next.push(`${form}-${char}`)
    }
    forms.splice(0, forms.length, ...next)
  }
  return forms
}

export function isbnVariants(isbn13: string): string[] {
  if (!/^978(?:951|952)\d{7}$/.test(isbn13)) return []
  const stem = isbn13.slice(3, 12)
  let sum = 0
  for (let i = 0; i < stem.length; i++) sum += Number(stem[i]) * (10 - i)
  const digit = (11 - (sum % 11)) % 11
  const isbn10 = `${stem}${digit === 10 ? 'X' : digit}`
  return [...hyphenations(isbn13), ...hyphenations(isbn10)]
}

export function kirjasampoQuery(isbn13: string): string {
  const literals = isbnVariants(isbn13).flatMap((isbn) => [
    `"${isbn}"`,
    `"${isbn}"@fi`,
    `"${isbn}"@sv`,
  ])
  return `PREFIX schema: <http://schema.org/>
PREFIX kaunokki: <http://www.yso.fi/onto/kaunokki#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?work ?title ?theme ?description WHERE {
  VALUES ?isbn { ${literals.join(' ')} }
  VALUES ?isbnProperty { schema:isbn kaunokki:ISBN }
  ?work ?isbnProperty ?isbn .
  OPTIONAL { ?work skos:prefLabel ?title . FILTER(LANG(?title) = "fi") }
  OPTIONAL { ?work kaunokki:teema/skos:prefLabel ?theme . FILTER(LANG(?theme) = "fi") }
  OPTIONAL { ?work kaunokki:kuvaus ?description . FILTER(LANG(?description) = "fi") }
}`
}

type Binding = { type?: unknown; value?: unknown; 'xml:lang'?: unknown }
function term(row: Record<string, unknown>, key: string, type: string): string | undefined {
  const value = row[key]
  if (!isObject(value) || value.type !== type) return undefined
  return clean(value.value)
}

export function kirjasampoResults(body: unknown, isbn13: string): SourceResult[] | undefined {
  if (!isObject(body) || !isObject(body.results) || !Array.isArray(body.results.bindings))
    return lookupFailed(LABEL, isbn13, 'malformed SPARQL response')
  const works = new Map<string, { title?: string; themes: Set<string>; description?: string }>()
  for (const row of list(body.results.bindings)) {
    if (!isObject(row)) return lookupFailed(LABEL, isbn13, 'malformed SPARQL binding')
    const work = term(row, 'work', 'uri')
    const title = term(row, 'title', 'literal')
    if (!work) return lookupFailed(LABEL, isbn13, 'malformed work binding')
    const found = works.get(work) ?? { themes: new Set<string>() }
    if (title && (row.title as Binding)['xml:lang'] === 'fi') found.title ??= title
    const theme = term(row, 'theme', 'literal')
    if (theme && (row.theme as Binding)['xml:lang'] === 'fi') found.themes.add(theme)
    const description = term(row, 'description', 'literal')
    if (description && (row.description as Binding)['xml:lang'] === 'fi')
      found.description ??= description
    works.set(work, found)
  }
  if (works.size > 1) {
    logger().warn({ isbn13, works: works.size }, 'Kirjasampo lookup ambiguous')
    return []
  }
  const first = works.entries().next().value
  if (!first) return []
  const [recordId, work] = first
  if (!work.title) return []
  return [
    {
      isbn13,
      title: work.title,
      authors: [],
      subjects: [],
      themes: [...work.themes],
      ...(work.description ? { description: work.description } : {}),
      source: 'kirjasampo',
      recordId,
      raw: { kirjasampo: body },
    },
  ]
}

export const kirjasampo = {
  id: 'kirjasampo',
  enrichment: true,
  async lookupByIsbn(isbn13: string): Promise<SourceResult[] | undefined> {
    if (isbnVariants(isbn13).length === 0) return []
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ query: kirjasampoQuery(isbn13) }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        return lookupFailed(LABEL, isbn13, `HTTP ${response.status}`)
      }
      return kirjasampoResults(await response.json(), isbn13)
    } catch (err) {
      return lookupFailed(LABEL, isbn13, 'network or response error', { err })
    }
  },
} as const
