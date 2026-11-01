import { existsSync, readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { logger } from '@/lib/errors'
import type { SearchHit } from '@/lib/metadata/source'
import { finna } from '@/lib/metadata/sources/finna'

import { querySlug } from '../../scripts/capture-fixtures'

const FIXTURES = new URL('../fixtures/finna/search/', import.meta.url)

type Record_ = {
  id?: string
  isbns?: unknown
  images?: unknown
  shortTitle?: string
  title?: string
}
type Body = { status?: string; resultCount?: number; records?: Record_[] }

/** The response `npm run fixtures` recorded for this query, keyed as the script keys it. */
function fixture(query: string): Body {
  const file = new URL(`${querySlug(query)}.json`, FIXTURES)
  if (!existsSync(file)) throw new Error(`no recorded Finna search for "${query}"`)
  return JSON.parse(readFileSync(file, 'utf8')) as Body
}

/** The record with this id; the fixtures are committed, so it is there. */
function record(body: Body, id: string): Record_ {
  return body.records!.find((entry) => entry.id === id)!
}

/**
 * Serves the recorded response for the query in the request's `lookfor`, optionally edited.
 * A query with no fixture fails the test instead of reaching `getJson`, which would swallow
 * the error as a network failure and leave a plausible `[]` behind.
 */
function serveFixtures(query: string, edit: (body: Body) => void = () => {}): void {
  const body = fixture(query)
  edit(body)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      expect(new URL(url).searchParams.get('lookfor')).toBe(query)
      return Response.json(body)
    }),
  )
}

function search(query: string): Promise<SearchHit[]> {
  if (!finna.search) throw new Error('the Finna source has no search')
  return finna.search(query)
}

const isbns = (hits: SearchHit[]): string[] => hits.map((hit) => hit.isbn13)

let warn: MockInstance

beforeEach(() => {
  warn = vi.spyOn(logger(), 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('finna.search', () => {
  it('trims the query, and answers nothing for an empty one without asking Finna', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(search('')).resolves.toStrictEqual([])
    await expect(search('   ')).resolves.toStrictEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()

    // The stub fails the test unless the trimmed query is what reached Finna.
    serveFixtures('tuntematon sotilas')
    expect(await search('  tuntematon sotilas  ')).not.toStrictEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('answers one hit per ISBN-13 in Finna order, with the hit fields and no others', async () => {
    serveFixtures('yuval noah harari')
    const hits = await search('yuval noah harari')

    expect(hits.slice(0, 4)).toStrictEqual([
      {
        isbn13: '9789528703693',
        title: 'Nexus (pokkari) Tietoverkkojen lyhyt historia',
        authors: [{ name: 'Yuval Noah Harari', sortName: 'Harari, Yuval Noah' }],
        publisher: 'Bazar',
        year: 2026,
        source: 'finna',
        hasCover: false,
      },
      {
        isbn13: '9789127140394',
        title: 'Sapiens',
        authors: [{ name: 'Yuval Noah Harari', sortName: 'Harari, Yuval Noah' }],
        publisher: 'Natur & Kultur',
        year: 2015,
        source: 'finna',
        hasCover: false,
      },
      {
        isbn13: '9781843830641',
        title: 'Renaissance military memoirs',
        authors: [{ name: 'Yuval Noah Harari', sortName: 'Harari, Yuval Noah' }],
        publisher: 'Boydell Press',
        year: 2004,
        binding: 'hardback',
        source: 'finna',
        hasCover: false,
      },
      {
        isbn13: '9789127164178',
        title: '21 tankar om det 21:a århundradet',
        authors: [{ name: 'Yuval Noah Harari', sortName: 'Harari, Yuval Noah' }],
        publisher: 'Natur & Kultur',
        year: 2019,
        binding: 'mjuka pärmar',
        source: 'finna',
        hasCover: true,
      },
    ])
    expect(new Set(isbns(hits)).size).toBe(hits.length)
    expect(warn).not.toHaveBeenCalled()
  })

  it('drops the records whose isbns yield no ISBN-13, and expands those that name several', async () => {
    serveFixtures('tuntematon sotilas')
    const hits = await search('tuntematon sotilas')

    // The image-only archive records at the head of the answer name no ISBN and are out;
    // `jykdok.844498` names four bindings and gives one hit each.
    expect(isbns(hits)).toStrictEqual([
      '9789510432518',
      '9789510244449',
      '9789510250013',
      '9789510250945',
      '9789510252581',
      '9789510024058',
      '9789518612066',
    ])
    expect(hits.map((hit) => hit.binding)).toStrictEqual([
      undefined,
      'kovakantinen',
      '1/2-n',
      'kokonaisuus kovakantinen',
      'kokonaisuus 1/2-n',
      undefined,
      undefined,
    ])
    expect(hits[0]).not.toHaveProperty('binding')
  })

  it('keeps the first record of a duplicated ISBN but takes a cover from any of them', async () => {
    serveFixtures('tuntematon sotilas')
    const hits = await search('tuntematon sotilas')

    // `anders.a0a93c82…` has no image, the later `kangasniemi.c087…` for the same ISBN has two.
    expect(hits[0]).toMatchObject({
      isbn13: '9789510432518',
      title: 'Tuntematon sotilas',
      year: 2017,
      hasCover: true,
    })
    expect(hits.filter((hit) => hit.isbn13 === '9789510432518')).toHaveLength(1)
    // Both records of that ISBN name the same authors, but only the first states their roles.
    expect(hits[0]!.authors).toStrictEqual([
      { name: 'Väinö Linna', sortName: 'Linna, Väinö' },
      { name: 'Veikko Honkanen', sortName: 'Honkanen, Veikko' },
    ])
    expect(hits.every((hit) => typeof hit.hasCover === 'boolean')).toBe(true)
    expect(hits.filter((hit) => hit.hasCover)).toHaveLength(1)
  })
})

describe('finna.search over an edited answer', () => {
  it('drops a record without a title or without an id', async () => {
    serveFixtures('tuntematon sotilas', (body) => {
      delete record(body, 'anders.a0a93c82-2af7-4280-b1c6-2c40c9566757').shortTitle
      delete record(body, 'anders.a0a93c82-2af7-4280-b1c6-2c40c9566757').title
      delete record(body, 'kangasniemi.c087fe7d-c15d-46de-92e5-8dbab338a08b').shortTitle
      delete record(body, 'kangasniemi.c087fe7d-c15d-46de-92e5-8dbab338a08b').title
      delete record(body, 'arto.018891571').id
    })

    const hits = await search('tuntematon sotilas')

    expect(isbns(hits)).not.toContain('9789510432518')
    expect(isbns(hits)).not.toContain('9789518612066')
    expect(warn).not.toHaveBeenCalled()
  })

  it('reports no cover when no record carrying the ISBN has an image', async () => {
    serveFixtures('tuntematon sotilas', (body) => {
      record(body, 'kangasniemi.c087fe7d-c15d-46de-92e5-8dbab338a08b').images = []
    })

    const hits = await search('tuntematon sotilas')

    expect(hits[0]).toMatchObject({ isbn13: '9789510432518', hasCover: false })
    expect(hits.some((hit) => hit.hasCover)).toBe(false)
  })

  it('answers nothing for a query Finna has no match for, without logging', async () => {
    serveFixtures('qwzxvb kirjaton teos 12345')

    await expect(search('qwzxvb kirjaton teos 12345')).resolves.toStrictEqual([])
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('finna.search without a usable answer', () => {
  const stubFetch = (impl: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(impl))

  it.each<[string, () => Promise<Response>]>([
    ['status is not OK', async () => Response.json({ status: 'ERROR', statusMessage: 'nope' })],
    ['records is not an array', async () => Response.json({ status: 'OK', records: {} })],
    ['body is a string', async () => Response.json('nope')],
    ['body is null', async () => Response.json(null)],
    ['body is an array', async () => Response.json([])],
    ['fetch rejects', () => Promise.reject(new TypeError('fetch failed'))],
    [
      'the request times out',
      () => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' })),
    ],
    ['HTTP 500', async () => new Response('oops', { status: 500 })],
    ['the body is not JSON', async () => new Response('not json')],
  ])('answers [] when %s, logging once with the query and not the URL', async (_, impl) => {
    stubFetch(impl)

    await expect(search('tuntematon sotilas')).resolves.toStrictEqual([])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toMatchObject({ query: 'tuntematon sotilas' })
    expect(logged(warn.mock.calls)).not.toContain('api.finna.fi')
  })
})

/** Every string in the logged arguments, error messages and stacks included. */
function logged(value: unknown): string {
  if (value instanceof Error) return `${value.message} ${value.stack} ${logged(value.cause)}`
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(logged).join(' ')
  if (typeof value === 'object' && value !== null) return Object.values(value).map(logged).join(' ')
  return ''
}
