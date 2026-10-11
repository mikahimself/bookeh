import { readFileSync, readdirSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { logger } from '@/lib/errors'
import { finna } from '@/lib/metadata/sources/finna'

const FIXTURES = new URL('../fixtures/finna/', import.meta.url)

function fixture(isbn13: string): unknown {
  return JSON.parse(readFileSync(new URL(`${isbn13}.json`, FIXTURES), 'utf8'))
}

type Body = { records: { id: string; subjects: unknown[] }[] }

/** Serves the recorded response for the ISBN in the request's `lookfor`, optionally edited. */
function serveFixtures(edit: (body: Body) => void = () => {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const lookfor = new URL(url).searchParams.get('lookfor') ?? ''
      const isbn13 = /isbn:"(\d{13})"/.exec(lookfor)?.[1] ?? ''
      const body = fixture(isbn13) as Body
      edit(body)
      return Response.json(body)
    }),
  )
}

let warn: MockInstance

beforeEach(() => {
  warn = vi.spyOn(logger(), 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('finna.lookupByIsbn', () => {
  beforeEach(() => serveFixtures())

  it('keeps only the record with the ISBN asked for, among other editions', async () => {
    const results = await finna.lookupByIsbn('9789524035699')

    expect(results).toStrictEqual([
      {
        isbn13: '9789524035699',
        title: 'Sapiens',
        subtitle: 'ihmisen lyhyt historia',
        authors: [{ name: 'Yuval Noah Harari' }],
        publisher: 'Bazar',
        year: 2024,
        language: 'fi',
        pages: 491,
        subjects: [],
        themes: [],
        binding: 'pehmeäkantinen',
        coverUrl: 'https://api.finna.fi/Cover/Show?source=Solr&id=helle.1637236&index=0&size=large',
        source: 'finna',
        raw: { finna: fixture('9789524035699') },
      },
    ])
  })

  it('orders several matches best first', async () => {
    const results = await finna.lookupByIsbn('9780007466061')

    expect(results).toHaveLength(2)
    expect(results[0].coverUrl).toContain('id=kirkes.399381')
    expect(results[0].binding).toBe('nidottu')
    expect(results[1]).not.toHaveProperty('coverUrl')
    expect(results[1]).not.toHaveProperty('binding')
  })

  it('puts a record with a cover first whatever Finna’s order', async () => {
    serveFixtures((body) => body.records.reverse())

    const [best] = await finna.lookupByIsbn('9780007466061')

    expect(best.coverUrl).toContain('id=kirkes.399381')
  })

  it('puts a record with subjects ahead of one without, when neither has a cover', async () => {
    // Finna lists heili (no binding) before eepos (`nidottu`); both have subjects.
    serveFixtures((body) => {
      body.records.find(({ id }) => id.startsWith('heili.'))!.subjects = []
    })

    const results = await finna.lookupByIsbn('9789515789631')

    expect(results.map(({ binding }) => binding)).toEqual(['nidottu', undefined])
  })

  it.each([
    ['9789517685535', ['Paulo Freire', 'Tuukka Tomperi', 'Juha Suoranta']], // "kirjoittaja, toimittaja"
    ['9789523521957', ['Veikka Lahtinen', 'Pontus Purokuru']], // afterword writer left out
    ['9780007448036', ['George R. R. Martin']], // "författare"
  ])('reads the author roles of %s', async (isbn13, names) => {
    const [result] = await finna.lookupByIsbn(isbn13)

    expect(result.authors).toEqual(names.map((name) => ({ name })))
  })

  it('leaves out a role-less translator and reads pages from the extent', async () => {
    const results = await finna.lookupByIsbn('9789515789631')

    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(result.authors).toEqual([{ name: 'Erlend Loe' }])
      expect(result.pages).toBe(222)
    }
  })

  it('reads the older "s." page abbreviation', async () => {
    const [result] = await finna.lookupByIsbn('9789510397077')

    expect(result.pages).toBe(200)
  })

  it("takes the description from the record's first summary", async () => {
    const [result] = await finna.lookupByIsbn('9789511319177')

    expect(result.description).toMatch(/^Tähtitieteilijän oppipojan tie .* jää taakse\.$/)
  })

  const isbns = readdirSync(FIXTURES)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))

  it.each(isbns)('maps %s within the contract', async (isbn13) => {
    const results = await finna.lookupByIsbn(isbn13)

    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(result.isbn13).toBe(isbn13)
      expect(result.title).not.toBe('')
      expect(result.authors.length).toBeGreaterThan(0)
      expect(result.authors.every(({ name }) => !name.includes(','))).toBe(true)
      const { raw: _raw, ...fields } = result
      for (const text of texts(fields)) {
        expect(text).toBe(text.normalize('NFC').trim())
        expect(text).not.toBe('')
      }
    }
    expect(warn).not.toHaveBeenCalled()
  })
})

function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(texts)
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(texts)
  return []
}

describe('finna.lookupByIsbn without a usable answer', () => {
  const stubFetch = (impl: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(impl))

  it.each([
    ['records: []', { resultCount: 0, status: 'OK', records: [] }],
    ['records left out', { resultCount: 0, status: 'OK' }],
  ])('answers nothing for an empty result (%s), without logging', async (_, body) => {
    stubFetch(async () => Response.json(body))

    expect(await finna.lookupByIsbn('9789524035699')).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it.each<[string, () => Promise<Response>]>([
    ['fetch rejects', () => Promise.reject(new TypeError('fetch failed'))],
    ['HTTP 500', async () => new Response('oops', { status: 500 })],
    ['body is not JSON', async () => new Response('not json')],
    ['status is not OK', async () => Response.json({ status: 'ERROR' })],
    ['records is not an array', async () => Response.json({ status: 'OK', records: {} })],
  ])('answers nothing when %s, logging once', async (_, impl) => {
    stubFetch(impl)

    await expect(finna.lookupByIsbn('9789524035699')).resolves.toEqual([])
    expect(warn).toHaveBeenCalledOnce()
  })
})
