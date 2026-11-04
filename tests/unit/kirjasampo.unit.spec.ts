import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'

import {
  isbnVariants,
  kirjasampo,
  kirjasampoQuery,
  kirjasampoResults,
} from '@/lib/metadata/sources/kirjasampo'
import { mergeResults } from '@/lib/metadata/merge'
import { finnaResults } from '@/lib/metadata/sources/finna'
import { fixture, fixtureKirjasampo } from '@/lib/metadata/sources/fixture'
import { buildReport, readIsbnList } from '../../scripts/capture-fixtures'

const ISBN = '9789510397077'
const literal = (value: string, language = 'fi') => ({
  type: 'literal',
  value,
  'xml:lang': language,
})
const work = { type: 'uri', value: 'http://example.test/work/1' }

describe('Kirjasampo enrichment', () => {
  afterEach(() => vi.restoreAllMocks())

  it('queries all ISBN-13 and equivalent ISBN-10 hyphenations and language forms', () => {
    const variants = isbnVariants(ISBN)
    expect(variants).toHaveLength(4096 + 512)
    expect(variants).toContain(ISBN)
    expect(variants).toContain('978-951-0-39707-7')
    expect(variants).toContain('9510397075')
    const query = kirjasampoQuery(ISBN)
    for (const value of ['"978-951-0-39707-7"', '"9510397075"@fi', '"9510397075"@sv'])
      expect(query).toContain(value)
    expect(query).toContain('schema:isbn kaunokki:ISBN')
    expect(query).not.toContain('REPLACE')
  })

  it('parses Finnish work fields and rejects distinct works', () => {
    const row = {
      work,
      title: literal('Hytti nro 6'),
      theme: literal('matka'),
      description: literal('Kuvaus'),
    }
    expect(
      kirjasampoResults(
        { results: { bindings: [row, { ...row, theme: literal('resa', 'sv') }] } },
        ISBN,
      ),
    ).toMatchObject([
      {
        title: 'Hytti nro 6',
        authors: [],
        subjects: [],
        themes: ['matka'],
        description: 'Kuvaus',
        recordId: work.value,
      },
    ])
    expect(
      kirjasampoResults(
        {
          results: {
            bindings: [row, { ...row, work: { type: 'uri', value: 'http://example.test/work/2' } }],
          },
        },
        ISBN,
      ),
    ).toEqual([])
    expect(
      kirjasampoResults(
        {
          results: {
            bindings: [row, { work: { type: 'uri', value: 'http://example.test/work/2' } }],
          },
        },
        ISBN,
      ),
    ).toEqual([])
  })

  it('does not request an ISBN outside the Finnish prefix', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected request'))
    expect(await kirjasampo.lookupByIsbn('9780141439518')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requests and parses recorded Finnish enrichment through the production adapter', async () => {
    const isbn13 = '9789520408053'
    const response = await readFile(`tests/fixtures/kirjasampo/${isbn13}.json`, 'utf8')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(response, { headers: { 'Content-Type': 'application/sparql-results+json' } }),
    )

    const result = await kirjasampo.lookupByIsbn(isbn13)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe('https://ldf.fi/kirjasampo/sparql')
    expect(request?.method).toBe('POST')
    const headers = new Headers(request?.headers)
    expect(headers.get('Accept')).toBe('application/sparql-results+json')
    expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded')
    expect(request?.body).toBeInstanceOf(URLSearchParams)
    const query = new URLSearchParams(request?.body as URLSearchParams).get('query')
    for (const clause of [
      'PREFIX schema: <http://schema.org/>',
      'PREFIX kaunokki: <http://www.yso.fi/onto/kaunokki#>',
      'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>',
      'SELECT DISTINCT ?work ?title ?theme ?description',
      '"9789520408053"',
      'VALUES ?isbnProperty { schema:isbn kaunokki:ISBN }',
      '?work ?isbnProperty ?isbn .',
      'OPTIONAL { ?work skos:prefLabel ?title . FILTER(LANG(?title) = "fi") }',
      'OPTIONAL { ?work kaunokki:teema/skos:prefLabel ?theme . FILTER(LANG(?theme) = "fi") }',
      'OPTIONAL { ?work kaunokki:kuvaus ?description . FILTER(LANG(?description) = "fi") }',
    ]) {
      expect(query).toContain(clause)
    }
    expect(result).toMatchObject([
      {
        isbn13,
        source: 'kirjasampo',
        recordId: 'http://data.kirjasampo.fi/abstractWork_4149488',
        title: 'Ei enää Eddy',
        themes: [
          'erilaisuus',
          'köyhyys',
          'homoseksuaalisuus',
          'identiteetti',
          'kiusaaminen',
          'omaelämäkerrallisuus',
          'alkoholismi',
          'ulkopuolisuus',
          'kasvu',
        ],
      },
    ])
  })

  it('returns undefined when the production adapter request fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network unavailable'))

    expect(await kirjasampo.lookupByIsbn('9789520408053')).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports malformed endpoint responses as failure', () => {
    expect(kirjasampoResults({ results: { bindings: 'bad' } }, ISBN)).toBeUndefined()
    expect(kirjasampoResults({ results: { bindings: [{}] } }, ISBN)).toBeUndefined()
  })

  it('merges recorded Kirjasampo themes into a Finna edition without replacing its identity', async () => {
    const isbn13 = '9789520408053'
    const read = async (source: string) =>
      JSON.parse(await readFile(`tests/fixtures/${source}/${isbn13}.json`, 'utf8')) as unknown
    const finna = finnaResults(await read('finna'), isbn13) ?? []
    const work = kirjasampoResults(await read('kirjasampo'), isbn13) ?? []
    expect(finna.length).toBeGreaterThan(0)
    expect(work).toHaveLength(1)
    const merged = mergeResults([finna], new Date('2026-11-04T00:00:00Z'), [work])!
    expect(merged.result.source).toBe('finna')
    expect(merged.result.recordId).toBe(finna[0].recordId)
    expect(merged.result.title).toBe(finna[0].title)
    expect(merged.result.authors).toEqual(finna[0].authors)
    expect(merged.result.publisher).toBe(finna[0].publisher)
    expect(merged.result.themes).toContain('erilaisuus')
  })

  it('enriches the fixture source used by Answer and save', async () => {
    const isbn13 = '9789520408053'
    const ordinary = await fixture.lookupByIsbn(isbn13)
    const enrichment = await fixtureKirjasampo.lookupByIsbn(isbn13)
    expect(ordinary).toHaveLength(1)
    expect(enrichment).toHaveLength(1)
    const merged = mergeResults([ordinary!], new Date('2026-11-04T00:00:00Z'), [enrichment!])!
    expect(merged.result.source).toBe('finna')
    expect(merged.result.title).toBe(ordinary![0].title)
    expect(merged.result.themes).toContain('erilaisuus')
  })

  it('reports recorded ISBN-13, ISBN-10, X and missing-work cases', async () => {
    const isbns = readIsbnList(await readFile('tests/fixtures/isbns.txt', 'utf8'))
    const { markdown, missing } = await buildReport(isbns, 'tests/fixtures', '2026-11-04')
    expect(missing).toEqual([])
    expect(markdown).toContain('951768553X')
    expect(markdown).toContain('9515781841')
    expect(markdown).toContain('978-952-04-0805-3')
    expect(markdown).toContain('Found by Kirjasampo: 16 of 30')
    const xIsbn = '9789515789631'
    expect(isbnVariants(xIsbn)).toContain('951-578-963-X')
    expect(
      kirjasampoResults(
        JSON.parse(await readFile(`tests/fixtures/kirjasampo/${xIsbn}.json`, 'utf8')) as unknown,
        xIsbn,
      ),
    ).toHaveLength(1)
  })
})
