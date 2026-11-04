import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { logger } from '@/lib/errors'
import { mergeResults } from '@/lib/metadata/merge'
import type { SourceResult } from '@/lib/metadata/source'
import { finna } from '@/lib/metadata/sources/finna'
import { openLibrary } from '@/lib/metadata/sources/openLibrary'

const FIXTURES = new URL('../fixtures/openlibrary/', import.meta.url)
const CONTACT = 'tester@example.test'

/** A recorded response body: `<isbn13>.json`, or `search/<slug>.json`. */
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8')) as unknown
}

const fetchMock = (impl: () => Promise<Response>) => {
  const mock = vi.fn(impl)
  vi.stubGlobal('fetch', mock)
  return mock
}

/** Answers every request with this body. */
const serve = (body: unknown) => fetchMock(async () => Response.json(body))

const requested = (mock: ReturnType<typeof fetchMock>): URL[] =>
  mock.mock.calls.map((call) => new URL(String((call as unknown[])[0])))

const headersOf = (mock: ReturnType<typeof fetchMock>): Record<string, string>[] =>
  mock.mock.calls.map(
    (call) => ((call as unknown[])[1] as RequestInit).headers as Record<string, string>,
  )

/** The records of an answered lookup; fails the test when the source reports a failure. */
async function lookup(isbn13: string): Promise<SourceResult[]> {
  const results = await openLibrary.lookupByIsbn(isbn13)
  if (results === undefined) throw new Error(`Open Library lookup of ${isbn13} failed`)
  return results
}

let warn: MockInstance

beforeEach(() => {
  warn = vi.spyOn(logger(), 'warn').mockImplementation(() => {})
  vi.stubEnv('OPEN_LIBRARY_CONTACT', CONTACT)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Open Library lookup', () => {
  it('parses a held book, and asks for that ISBN with the contact in the User-Agent', async () => {
    const mock = serve(fixture('9789511319177'))

    const [result] = await lookup('9789511319177')

    const url = requested(mock)[0]
    expect(url.origin + url.pathname).toBe('https://openlibrary.org/api/books')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      bibkeys: 'ISBN:9789511319177',
      jscmd: 'data',
      format: 'json',
    })
    expect(headersOf(mock)[0]).toMatchObject({ 'User-Agent': `bookeh (${CONTACT})` })
    expect(result).toEqual({
      isbn13: '9789511319177',
      title: 'Taivaanpallo',
      authors: [{ name: 'Jalonen Olli' }],
      publisher: 'Otava',
      year: 2018,
      pages: 461,
      subjects: ['Travel', 'Fiction', 'Astronomers', 'Astronomy', 'Finnish literature', 'Sailing'],
      themes: [],
      source: 'openlibrary',
      recordId: '/books/OL32370247M',
      raw: { openlibrary: fixture('9789511319177') },
    })
    // Open Library's covers redirect (AD-14) and `jscmd=data` carries no description or language.
    expect(result).not.toHaveProperty('coverUrl')
    expect(result).not.toHaveProperty('description')
    expect(result).not.toHaveProperty('language')
  })

  it('answers nothing for an ISBN it does not hold, and for another key', async () => {
    serve(fixture('9789510397077'))
    expect(await lookup('9789510397077')).toEqual([])

    serve({ 'ISBN:9780007447848': { title: 'A storm of swords', key: '/books/OL1M' } })
    expect(await lookup('9789510397077')).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('reports a failure as undefined, logging the ISBN and no URL', async () => {
    fetchMock(async () => new Response('', { status: 500 }))

    expect(await openLibrary.lookupByIsbn('9789511319177')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]).toEqual([
      { isbn13: '9789511319177' },
      'Open Library lookup failed: HTTP 500',
    ])
  })

  it('reports a body that is not an object as a failure', async () => {
    serve([{ 'ISBN:9789511319177': {} }])

    expect(await openLibrary.lookupByIsbn('9789511319177')).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      { isbn13: '9789511319177' },
      'Open Library lookup failed: response is not an object',
    )
  })

  it('skips an entry without a title or without a key, and leaves an unparsable year out', async () => {
    const entry = (extra: Record<string, unknown>) => ({ 'ISBN:9789511319177': extra })

    serve(entry({ key: '/books/OL1M' }))
    expect(await lookup('9789511319177')).toEqual([])

    serve(entry({ title: 'Taivaanpallo' }))
    expect(await lookup('9789511319177')).toEqual([])

    serve(entry({ title: 'Taivaanpallo', key: '/books/OL1M', publish_date: 'May' }))
    const [noYear] = await lookup('9789511319177')
    expect(noYear).not.toHaveProperty('year')

    serve(entry({ title: 'Taivaanpallo', key: '/books/OL1M', publish_date: 'May 05, 2018' }))
    expect((await lookup('9789511319177'))[0].year).toBe(2018)
  })

  it('takes pages from `pagination` when the record has no `number_of_pages`', async () => {
    // 9780007466061 states `pagination: "690p."` only; pages is a field this source gap-fills.
    serve(fixture('9780007466061'))

    expect((await lookup('9780007466061'))[0].pages).toBe(690)
  })
})

describe('Open Library search', () => {
  it('builds one hit per edition ISBN, the first occurrence winning, with no cover URL', async () => {
    const mock = serve(fixture('search/tuntematon-sotilas'))

    const hits = await openLibrary.search!('tuntematon sotilas')

    const url = requested(mock)[0]
    expect(url.origin + url.pathname).toBe('https://openlibrary.org/search.json')
    expect(url.searchParams.get('q')).toBe('tuntematon sotilas')
    expect(url.searchParams.get('fields')).toContain('editions.isbn')
    expect(headersOf(mock)[0]).toMatchObject({ 'User-Agent': `bookeh (${CONTACT})` })
    // The work-level `isbn` list mixes every edition; only the edition docs are read, so the
    // 1977 edition's two ISBN forms give one hit and the 1955 edition (no ISBN) gives none.
    expect(hits[0]).toEqual({
      isbn13: '9789519912066',
      title: 'Tuntematon sotilas',
      authors: [{ name: 'Väinö Linna' }],
      publisher: 'Yhtyneet kuvalehdet, Suur-Seura',
      year: 1977,
      source: 'openlibrary',
    })
    expect(hits.every((hit) => hit.coverUrl === undefined)).toBe(true)
    expect(new Set(hits.map((hit) => hit.isbn13)).size).toBe(hits.length)
    expect(hits.map((hit) => hit.isbn13)).toContain('9780141393643')
  })

  it('takes the work title and the binding when the edition states one, once each', async () => {
    serve({
      docs: [
        {
          key: '/works/OL1W',
          title: 'Tuntematon sotilas',
          author_name: ['Väinö Linna'],
          editions: {
            docs: [
              { key: '/books/OL1M', isbn: ['9789519912066'], physical_format: 'Hardcover' },
              { key: '/books/OL2M', isbn: ['9519912061'], publisher: ['Later'] },
            ],
          },
        },
      ],
    })

    const hits = await openLibrary.search!('tuntematon sotilas')

    expect(hits).toEqual([
      {
        isbn13: '9789519912066',
        title: 'Tuntematon sotilas',
        authors: [{ name: 'Väinö Linna' }],
        binding: 'Hardcover',
        source: 'openlibrary',
      },
    ])
  })

  it('caps the hits it returns, since `limit` caps works and not editions', async () => {
    serve(fixture('search/yuval-noah-harari'))

    // 20 works, 40 edition ISBNs between them: one screen of results, not two.
    expect(await openLibrary.search!('yuval noah harari')).toHaveLength(20)
  })

  it('answers with an empty list for no match, a failure, an unusable body and blank text', async () => {
    serve(fixture('search/qwzxvb-kirjaton-teos-12345'))
    expect(await openLibrary.search!('qwzxvb kirjaton teos 12345')).toEqual([])
    expect(warn).not.toHaveBeenCalled()

    fetchMock(async () => new Response('', { status: 500 }))
    expect(await openLibrary.search!('tuntematon sotilas')).toEqual([])

    serve({ numFound: 1, docs: 'nope' })
    expect(await openLibrary.search!('tuntematon sotilas')).toEqual([])
    expect(warn.mock.calls).toEqual([
      [{ query: 'tuntematon sotilas' }, 'Open Library search failed: HTTP 500'],
      [{ query: 'tuntematon sotilas' }, 'Open Library search failed: docs is not an array'],
    ])

    const mock = serve({ docs: [] })
    expect(await openLibrary.search!('  ')).toEqual([])
    expect(mock).not.toHaveBeenCalled()
  })
})

describe('Open Library in the source array', () => {
  /** The ids of `sources`, freshly evaluated against the current environment. */
  async function sourceIds(): Promise<string[]> {
    vi.resetModules()
    const { sources } = await import('@/lib/metadata/sources')
    return sources.map((source) => source.id)
  }

  it('comes third with a contact, and is left out entirely without one', async () => {
    expect(await sourceIds()).toEqual(['finna', 'google', 'openlibrary'])

    vi.stubEnv('OPEN_LIBRARY_CONTACT', '')
    expect(await sourceIds()).toEqual(['finna', 'google'])
  })

  it('gap-fills a merged candidate behind Finna, never overriding it', async () => {
    const bodies: Record<string, unknown> = {
      'api.finna.fi': fixture('../finna/9789511319177'),
      'openlibrary.org': fixture('9789511319177'),
    }
    fetchMock(async (...args: unknown[]) =>
      Response.json(bodies[new URL(String(args[0])).hostname]),
    )
    const lists = await Promise.all(
      [finna, openLibrary].map(
        async (source) => (await source.lookupByIsbn('9789511319177')) ?? [],
      ),
    )

    const { result } = mergeResults(lists, new Date('2026-11-03T08:00:00.000Z'))!

    // Finna answered first, so it owns the candidate's identity and every field it has.
    expect(result.source).toBe('finna')
    expect(result.recordId).toBe(lists[0][0].recordId)
    expect(result.title).toBe(lists[0][0].title)
    expect(result.authors).toEqual(lists[0][0].authors)
    expect(result.pages).toBe(lists[0][0].pages)
    // Finna's subject terms are themes, so `subjects` is Open Library's alone.
    expect(lists[0][0].subjects).toEqual([])
    expect(result.subjects).toEqual(lists[1][0].subjects)
    expect(result.raw).toEqual({
      finna: lists[0][0].raw.finna,
      openlibrary: lists[1][0].raw.openlibrary,
    })
  })
})
