import { readFileSync, readdirSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { logger } from '@/lib/errors'
import type { SearchHit, SourceResult } from '@/lib/metadata/source'
import { google } from '@/lib/metadata/sources/google'

const FIXTURES = new URL('../fixtures/google/', import.meta.url)
const VOLUMES = new URL('volumes/', FIXTURES)

type Volume = {
  id: string
  volumeInfo: {
    authors?: string[]
    language?: string
    description?: string
    industryIdentifiers?: { type: string; identifier: string }[]
    imageLinks?: Record<string, string>
  }
}

function volume(id: string): Volume {
  return JSON.parse(readFileSync(new URL(`${id}.json`, VOLUMES), 'utf8')) as Volume
}

/** The cover URL the adapter builds from a volume's thumbnail. */
function coverOf(item: Volume): string {
  return `${item.volumeInfo.imageLinks!.thumbnail.replace(/^http:/, 'https:')}&fife=w2000`
}

/** The recorded `isbn:` search answer for this ISBN. */
function recorded(isbn13: string): { items: Volume[] } & Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`${isbn13}.json`, FIXTURES), 'utf8')) as never
}

function searchBody(items: unknown[]) {
  return { kind: 'books#volumes', totalItems: items.length, items }
}

const fetchMock = (impl: () => Promise<Response>) => {
  const mock = vi.fn(impl)
  vi.stubGlobal('fetch', mock)
  return mock
}

/** Answers every request with this body. */
const serve = (body: unknown) => fetchMock(async () => Response.json(body))

/** The request URLs the stubbed fetch received. */
const requested = (mock: ReturnType<typeof fetchMock>): URL[] =>
  mock.mock.calls.map((call) => new URL(String((call as unknown[])[0])))

/** The records of an answered lookup; fails the test when the source reports a failure. */
async function lookup(isbn13: string): Promise<SourceResult[]> {
  const results = await google.lookupByIsbn(isbn13)
  if (results === undefined) throw new Error(`google lookup of ${isbn13} failed`)
  return results
}

let warn: MockInstance

beforeEach(() => {
  warn = vi.spyOn(logger(), 'warn').mockImplementation(() => {})
  vi.stubEnv('GOOGLE_BOOKS_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('google.lookupByIsbn', () => {
  it('maps a full volume', async () => {
    const body = recorded('9780007448036')
    const [full] = body.items
    serve(body)

    const results = await lookup('9780007448036')

    expect(results).toStrictEqual([
      {
        isbn13: '9780007448036',
        title: 'A Game of Thrones',
        authors: [{ name: 'George R. R. Martin' }],
        publisher: 'HarperCollins UK',
        year: 2011,
        language: 'en',
        pages: 818,
        description: full.volumeInfo.description,
        subjects: ['Fiction'],
        themes: [],
        coverUrl: coverOf(full),
        source: 'google',
        recordId: '3Wf_ffkFQmgC',
        raw: { google: body },
      },
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('maps a volume without cover or categories', async () => {
    serve(recorded('9789518581041'))

    const [result] = await lookup('9789518581041')

    expect(result).toMatchObject({ pages: 413, subjects: [] })
    expect(result).not.toHaveProperty('coverUrl')
  })

  it('leaves out what a sparse volume lacks', async () => {
    serve(recorded('9789523521957'))

    const [result] = await lookup('9789523521957')

    expect(result).not.toHaveProperty('description')
    expect(result).not.toHaveProperty('pages')
  })

  it('keeps the subtitle', async () => {
    serve(recorded('9780007447848'))

    const [result] = await lookup('9780007447848')

    expect(result.subtitle).toBe('Steel and Snow')
  })

  it('turns an HTML description into paragraphs', async () => {
    // No recorded search answer has an HTML description; this by-id volume does.
    serve(searchBody([volume('GzENB4wePpEC')]))

    const [{ description }] = await lookup('9780007447855')

    expect(description).not.toContain('<')
    expect(description).toMatch(/^HBO's hit series/)
    expect(description).toContain('the series.\n\n')
    expect(description).toContain('The Starks are scattered.')
    expect(description).not.toMatch(/\n{3}/)
  })

  it.each([
    [
      '<p>Tom &amp; Jerry&#39;s &quot;tale&quot; &amp;lt;b&amp;gt;</p>',
      'Tom & Jerry\'s "tale" &lt;b&gt;',
    ],
    ['Tom &amp; Jerry', 'Tom & Jerry'],
    ['<p>1 < 2 and 3 > 2</p>', '1 < 2 and 3 > 2'],
  ])('decodes entities and strips only real tags in %s', async (text, expected) => {
    const edited = recorded('9780007448036').items[0]
    edited.volumeInfo.description = text
    serve(searchBody([edited]))

    const [{ description }] = await lookup('9780007448036')

    expect(description).toBe(expected)
  })

  it('keeps only the volume with the ISBN asked for, among other editions', async () => {
    serve(searchBody([recorded('9780007447855').items[0], recorded('9780007447848').items[0]]))

    const results = await lookup('9780007447848')

    expect(results).toHaveLength(1)
    expect(results[0].subtitle).toBe('Steel and Snow')
  })

  it('matches a volume through its ISBN-10', async () => {
    const only10 = recorded('9780007447848').items[0]
    only10.volumeInfo.industryIdentifiers = only10.volumeInfo.industryIdentifiers!.filter(
      ({ type }) => type !== 'ISBN_13',
    )
    serve(searchBody([only10]))

    expect(await lookup('9780007447848')).toHaveLength(1)
  })

  it.each([
    ['another edition only', recorded('9780007447855')],
    ['items left out', { kind: 'books#volumes', totalItems: 0 }],
  ])('answers nothing without a matching volume (%s), without logging', async (_, body) => {
    serve(body)

    expect(await google.lookupByIsbn('9780007447848')).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('flips an inverted author name and keeps it as the sort name', async () => {
    const inverted = recorded('9780007448036').items[0]
    inverted.volumeInfo.authors = ['Martin, George R. R.']
    serve(searchBody([inverted]))

    const [result] = await lookup('9780007448036')

    expect(result.authors).toStrictEqual([
      { name: 'George R. R. Martin', sortName: 'Martin, George R. R.' },
    ])
  })

  it.each([
    ['iw', 'he'],
    ['und', undefined],
  ])('converts the language code %s', async (code, expected) => {
    const edited = recorded('9780007448036').items[0]
    edited.volumeInfo.language = code
    serve(searchBody([edited]))

    const [result] = await lookup('9780007448036')

    expect(result.language).toBe(expected)
    if (expected === undefined) expect(result).not.toHaveProperty('language')
  })

  it('asks for the largest image over https, without the page curl', async () => {
    const edited = recorded('9780007448036').items[0]
    const small = edited.volumeInfo.imageLinks!.smallThumbnail
    edited.volumeInfo.imageLinks = { smallThumbnail: `${small}&edge=curl` }
    serve(searchBody([edited]))

    const [{ coverUrl }] = await lookup('9780007448036')
    const url = new URL(coverUrl!)

    expect(url.protocol).toBe('https:')
    expect(url.searchParams.has('edge')).toBe(false)
    expect(url.searchParams.get('fife')).toBe('w2000')
    expect(url.searchParams.get('zoom')).toBe('5')
    expect(url.searchParams.get('imgtk')).toBe(new URL(small).searchParams.get('imgtk'))
  })

  it('leaves out a cover link that is not http(s)', async () => {
    const edited = recorded('9780007448036').items[0]
    edited.volumeInfo.imageLinks = { thumbnail: 'data:image/png;base64,AAAA' }
    serve(searchBody([edited]))

    const [result] = await lookup('9780007448036')

    expect(result).not.toHaveProperty('coverUrl')
  })

  it('puts a volume with a cover first', async () => {
    const [withCover, withoutCover] = recorded('9780007447848').items
    serve(searchBody([withoutCover, withCover]))

    const results = await lookup('9780007447848')

    expect(results).toHaveLength(2)
    expect(results[0]).toHaveProperty('coverUrl')
    expect(results[1]).not.toHaveProperty('coverUrl')
  })

  it('sends the API key only when it is set', async () => {
    const mock = serve(searchBody([]))

    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'test-key')
    await lookup('9780007448036')
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', '')
    await lookup('9780007448036')

    const [keyed, keyless] = requested(mock)
    expect(keyed.searchParams.get('key')).toBe('test-key')
    expect(keyless.searchParams.has('key')).toBe(false)
    for (const url of [keyed, keyless]) {
      expect(url.origin + url.pathname).toBe('https://www.googleapis.com/books/v1/volumes')
      expect(url.searchParams.get('q')).toBe('isbn:9780007448036')
    }
  })
})

describe('google.lookupByIsbn without a usable answer', () => {
  it.each<[string, () => Promise<Response>]>([
    ['HTTP 429', async () => new Response('slow down', { status: 429 })],
    ['HTTP 403', async () => new Response('forbidden', { status: 403 })],
    ['HTTP 503', async () => new Response('unavailable', { status: 503 })],
    ['fetch rejects', () => Promise.reject(new TypeError('fetch failed'))],
    ['body is not JSON', async () => new Response('not json')],
    ['items is not an array', async () => Response.json({ totalItems: 1, items: {} })],
  ])('reports a failure when %s, logging once without the key', async (_, impl) => {
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'secret-key-123')
    fetchMock(impl)

    await expect(google.lookupByIsbn('9780007448036')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    expect(logged(warn.mock.calls)).not.toContain('secret-key-123')
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

describe('google.lookupByIsbn over every recorded response', () => {
  const searches = readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const isbn13 = name.replace(/\.json$/, '')
      const body = recorded(isbn13)
      const found = (body.items ?? []).some(({ volumeInfo }) =>
        volumeInfo.industryIdentifiers?.some(({ identifier }) => identifier === isbn13),
      )
      return { name, isbn13, body, found }
    })

  it.each(searches)('$name', async ({ isbn13, body, found }) => {
    serve(body)

    const results = await lookup(isbn13)

    expect(results.length > 0).toBe(found)
    for (const result of results) {
      expect(result.isbn13).toBe(isbn13)
      expect(result.authors.every(({ name }) => !name.includes(','))).toBe(true)
      if (result.coverUrl !== undefined) {
        const url = new URL(result.coverUrl)
        expect(url.protocol).toBe('https:')
        expect(url.searchParams.get('fife')).toBe('w2000')
      }
    }
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('google.search', () => {
  it('maps a full volume to a hit, with its cover URL', async () => {
    const full = volume('3Wf_ffkFQmgC')
    serve(searchBody([full]))

    const hits = await google.search!('a game of thrones')

    expect(hits).toStrictEqual<SearchHit[]>([
      {
        isbn13: '9780007448036',
        title: 'A Game of Thrones',
        authors: [{ name: 'George R. R. Martin' }],
        publisher: 'Harper Voyager',
        year: 2011,
        source: 'google',
        coverUrl: coverOf(full),
      },
    ])
    expect(hits[0]).not.toHaveProperty('binding')
    expect(warn).not.toHaveBeenCalled()
  })

  it('leaves the cover URL out for a sparse volume', async () => {
    serve(searchBody([volume('D-Py0AEACAAJ')]))

    const [hit] = await google.search!('mikä internetiä vaivaa')

    expect(hit).toStrictEqual<SearchHit>({
      isbn13: '9789523521957',
      title: 'Mikä internetiä vaivaa?',
      authors: [{ name: 'Veikka Lahtinen' }],
      publisher: 'kosmos',
      year: 2024,
      source: 'google',
    })
    expect(hit).not.toHaveProperty('coverUrl')
  })

  it('flips an inverted author name and keeps it as the sort name', async () => {
    const inverted = volume('3Wf_ffkFQmgC')
    inverted.volumeInfo.authors = ['Martin, George R. R.']
    serve(searchBody([inverted]))

    const [hit] = await google.search!('martin')

    expect(hit.authors).toStrictEqual([
      { name: 'George R. R. Martin', sortName: 'Martin, George R. R.' },
    ])
  })

  it('converts an ISBN-10 when that is the only identifier', async () => {
    const only10 = volume('DWvlNEkUDPUC')
    only10.volumeInfo.industryIdentifiers = only10.volumeInfo.industryIdentifiers!.filter(
      ({ type }) => type !== 'ISBN_13',
    )
    serve(searchBody([only10]))

    const [hit] = await google.search!('a storm of swords')

    expect(hit.isbn13).toBe('9780007447848')
  })

  it.each([
    ['no identifiers', undefined],
    ['an ISSN only', [{ type: 'ISSN', identifier: '03178471' }]],
  ])('drops a volume with %s, without logging', async (_, identifiers) => {
    const edited = volume('3Wf_ffkFQmgC')
    edited.volumeInfo.industryIdentifiers = identifiers
    serve(searchBody([edited]))

    expect(await google.search!('a game of thrones')).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('drops a volume without a title, without logging', async () => {
    const untitled = volume('3Wf_ffkFQmgC')
    delete (untitled.volumeInfo as Record<string, unknown>).title
    serve(searchBody([untitled]))

    expect(await google.search!('a game of thrones')).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('leaves out a field the volume does not have', async () => {
    const sparse = volume('3Wf_ffkFQmgC')
    delete (sparse.volumeInfo as Record<string, unknown>).publisher
    delete (sparse.volumeInfo as Record<string, unknown>).publishedDate
    serve(searchBody([sparse]))

    const [hit] = await google.search!('a game of thrones')

    expect(hit).not.toHaveProperty('publisher')
    expect(hit).not.toHaveProperty('year')
  })

  it('prefers the ISBN-13 entry over an ISBN-10 one for a different ISBN', async () => {
    const edited = volume('3Wf_ffkFQmgC')
    const otherIsbn10 = volume('DWvlNEkUDPUC').volumeInfo.industryIdentifiers!.find(
      ({ type }) => type === 'ISBN_10',
    )!.identifier
    // The ISBN-10 comes first, so a single pass would convert it instead.
    edited.volumeInfo.industryIdentifiers = [
      { type: 'ISBN_10', identifier: otherIsbn10 },
      { type: 'ISBN_13', identifier: '9780007448036' },
    ]
    serve(searchBody([edited]))

    const [hit] = await google.search!('a game of thrones')

    expect(hit.isbn13).toBe('9780007448036')
  })

  it('keeps one hit per ISBN-13', async () => {
    const twice = [volume('3Wf_ffkFQmgC'), { ...volume('3Wf_ffkFQmgC'), id: 'other-record' }]
    serve(searchBody(twice))

    expect(await google.search!('a game of thrones')).toHaveLength(1)
  })

  it('fills a missing cover URL from a duplicate of the same ISBN-13', async () => {
    const full = volume('3Wf_ffkFQmgC')
    const stub = { ...volume('3Wf_ffkFQmgC'), id: 'catalogue-stub' }
    stub.volumeInfo = { ...stub.volumeInfo }
    delete stub.volumeInfo.imageLinks
    serve(searchBody([stub, full]))

    const hits = await google.search!('a game of thrones')

    expect(hits).toHaveLength(1)
    expect(hits[0].coverUrl).toBe(coverOf(full))
  })

  it('returns one hit per edition, in the order Google sent them', async () => {
    serve(searchBody([volume('DWvlNEkUDPUC'), volume('GzENB4wePpEC')]))

    const hits = await google.search!('a storm of swords')

    expect(hits.map(({ isbn13 }) => isbn13)).toStrictEqual(['9780007447848', '9780007447855'])
  })

  it('does not re-sort a volume with a cover first', async () => {
    serve(searchBody([volume('D-Py0AEACAAJ'), volume('MF11zQEACAAJ'), volume('3Wf_ffkFQmgC')]))

    const hits = await google.search!('kirja')

    expect(hits.map(({ coverUrl }) => coverUrl !== undefined)).toStrictEqual([false, false, true])
  })

  it('answers nothing when Google found nothing, without logging', async () => {
    serve({ kind: 'books#volumes', totalItems: 0 })

    expect(await google.search!('nothing at all')).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('makes no request for a blank query', async () => {
    const mock = serve(searchBody([volume('3Wf_ffkFQmgC')]))

    expect(await google.search!('   ')).toEqual([])
    expect(mock).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('sends the API key only when it is set', async () => {
    const mock = serve(searchBody([]))

    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'test-key')
    await google.search!('a game of thrones')
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', undefined)
    await google.search!('a game of thrones')

    const [keyed, keyless] = requested(mock)
    expect(keyed.searchParams.get('key')).toBe('test-key')
    expect(keyless.searchParams.has('key')).toBe(false)
    for (const url of [keyed, keyless]) {
      expect(url.origin + url.pathname).toBe('https://www.googleapis.com/books/v1/volumes')
      expect(url.searchParams.get('q')).toBe('a game of thrones')
      expect(url.searchParams.get('printType')).toBe('books')
      expect(url.searchParams.get('maxResults')).toBe('20')
    }
  })
})

describe('google.search without a usable answer', () => {
  it.each<[string, () => Promise<Response>]>([
    ['HTTP 429', async () => new Response('slow down', { status: 429 })],
    ['HTTP 403', async () => new Response('forbidden', { status: 403 })],
    ['HTTP 503', async () => new Response('unavailable', { status: 503 })],
    ['fetch rejects', () => Promise.reject(new TypeError('fetch failed'))],
    [
      'the request times out',
      () => Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
    ],
    ['body is not JSON', async () => new Response('not json')],
    ['body is not an object', async () => Response.json([{ id: 'x' }])],
    ['items is not an array', async () => Response.json({ totalItems: 1, items: {} })],
  ])('answers nothing when %s, logging the query once without the key', async (_, impl) => {
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'secret-key-123')
    fetchMock(impl)

    await expect(google.search!('a game of thrones')).resolves.toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    const call = logged(warn.mock.calls)
    expect(call).toContain('a game of thrones')
    expect(call).not.toContain('secret-key-123')
    expect(call).not.toContain('googleapis.com')
  })
})
