import { readFileSync, readdirSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { logger } from '@/lib/errors'
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
    const full = volume('3Wf_ffkFQmgC')
    const body = searchBody([full])
    serve(body)

    const results = await google.lookupByIsbn('9780007448036')

    expect(results).toStrictEqual([
      {
        isbn13: '9780007448036',
        title: 'A Game of Thrones',
        authors: [{ name: 'George R. R. Martin' }],
        publisher: 'Harper Voyager',
        year: 2011,
        language: 'en',
        pages: 694,
        description: full.volumeInfo.description,
        subjects: [
          'Fiction / Action & Adventure',
          'Fiction / Fantasy / General',
          'Fiction / Fantasy / Epic',
          'Fiction / Fantasy / Dark Fantasy',
          'Fiction / Fantasy / Action & Adventure',
          'Fiction / Fantasy / Dragons & Mythical Creatures',
          'Fiction / Media Tie-In',
        ],
        themes: [],
        coverUrl: `${full.volumeInfo.imageLinks!.thumbnail.replace(/^http:/, 'https:')}&fife=w2000`,
        source: 'google',
        raw: { google: body },
      },
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('maps a Finnish volume without cover or categories', async () => {
    serve(searchBody([volume('MF11zQEACAAJ')]))

    const [result] = await google.lookupByIsbn('9789518581041')

    expect(result).toMatchObject({ language: 'fi', pages: 413, subjects: [] })
    expect(result).not.toHaveProperty('coverUrl')
  })

  it('leaves out what a sparse volume lacks', async () => {
    serve(searchBody([volume('D-Py0AEACAAJ')]))

    const [result] = await google.lookupByIsbn('9789523521957')

    expect(result).not.toHaveProperty('description')
    expect(result).not.toHaveProperty('pages')
  })

  it('keeps the subtitle', async () => {
    serve(searchBody([volume('DWvlNEkUDPUC')]))

    const [result] = await google.lookupByIsbn('9780007447848')

    expect(result.subtitle).toBe('Steel and Snow')
  })

  it('turns an HTML description into paragraphs', async () => {
    serve(searchBody([volume('GzENB4wePpEC')]))

    const [{ description }] = await google.lookupByIsbn('9780007447855')

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
    const edited = volume('3Wf_ffkFQmgC')
    edited.volumeInfo.description = text
    serve(searchBody([edited]))

    const [{ description }] = await google.lookupByIsbn('9780007448036')

    expect(description).toBe(expected)
  })

  it('keeps only the volume with the ISBN asked for, among other editions', async () => {
    serve(searchBody([volume('GzENB4wePpEC'), volume('DWvlNEkUDPUC')]))

    const results = await google.lookupByIsbn('9780007447848')

    expect(results).toHaveLength(1)
    expect(results[0].subtitle).toBe('Steel and Snow')
  })

  it('matches a volume through its ISBN-10', async () => {
    const only10 = volume('DWvlNEkUDPUC')
    only10.volumeInfo.industryIdentifiers = only10.volumeInfo.industryIdentifiers!.filter(
      ({ type }) => type !== 'ISBN_13',
    )
    serve(searchBody([only10]))

    expect(await google.lookupByIsbn('9780007447848')).toHaveLength(1)
  })

  it.each([
    ['another edition only', searchBody([volume('GzENB4wePpEC')])],
    ['items left out', { kind: 'books#volumes', totalItems: 0 }],
  ])('answers nothing without a matching volume (%s), without logging', async (_, body) => {
    serve(body)

    expect(await google.lookupByIsbn('9780007447848')).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('flips an inverted author name and keeps it as the sort name', async () => {
    const inverted = volume('3Wf_ffkFQmgC')
    inverted.volumeInfo.authors = ['Martin, George R. R.']
    serve(searchBody([inverted]))

    const [result] = await google.lookupByIsbn('9780007448036')

    expect(result.authors).toStrictEqual([
      { name: 'George R. R. Martin', sortName: 'Martin, George R. R.' },
    ])
  })

  it.each([
    ['iw', 'he'],
    ['und', undefined],
  ])('converts the language code %s', async (code, expected) => {
    const edited = volume('3Wf_ffkFQmgC')
    edited.volumeInfo.language = code
    serve(searchBody([edited]))

    const [result] = await google.lookupByIsbn('9780007448036')

    expect(result.language).toBe(expected)
    if (expected === undefined) expect(result).not.toHaveProperty('language')
  })

  it('asks for the largest image over https, without the page curl', async () => {
    const edited = volume('3Wf_ffkFQmgC')
    const small = edited.volumeInfo.imageLinks!.smallThumbnail
    edited.volumeInfo.imageLinks = { smallThumbnail: `${small}&edge=curl` }
    serve(searchBody([edited]))

    const [{ coverUrl }] = await google.lookupByIsbn('9780007448036')
    const url = new URL(coverUrl!)

    expect(url.protocol).toBe('https:')
    expect(url.searchParams.has('edge')).toBe(false)
    expect(url.searchParams.get('fife')).toBe('w2000')
    expect(url.searchParams.get('zoom')).toBe('5')
    expect(url.searchParams.get('imgtk')).toBe(new URL(small).searchParams.get('imgtk'))
  })

  it('leaves out a cover link that is not http(s)', async () => {
    const edited = volume('3Wf_ffkFQmgC')
    edited.volumeInfo.imageLinks = { thumbnail: 'data:image/png;base64,AAAA' }
    serve(searchBody([edited]))

    const [result] = await google.lookupByIsbn('9780007448036')

    expect(result).not.toHaveProperty('coverUrl')
  })

  it('puts a volume with a cover first', async () => {
    const withCover = volume('DWvlNEkUDPUC')
    const withoutCover = { ...volume('DWvlNEkUDPUC'), id: 'no-cover' }
    delete withoutCover.volumeInfo.imageLinks
    serve(searchBody([withoutCover, withCover]))

    const results = await google.lookupByIsbn('9780007447848')

    expect(results).toHaveLength(2)
    expect(results[0]).toHaveProperty('coverUrl')
    expect(results[1]).not.toHaveProperty('coverUrl')
  })

  it('sends the API key only when it is set', async () => {
    const mock = serve(searchBody([]))

    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'test-key')
    await google.lookupByIsbn('9780007448036')
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', '')
    await google.lookupByIsbn('9780007448036')

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
  ])('answers nothing when %s, logging once without the key', async (_, impl) => {
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'secret-key-123')
    fetchMock(impl)

    await expect(google.lookupByIsbn('9780007448036')).resolves.toEqual([])
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
      const body: unknown = JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'))
      return { name, isbn13, body, matches: false }
    })
  const volumes = readdirSync(VOLUMES)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const recorded = volume(name.replace(/\.json$/, ''))
      const isbn13 = recorded.volumeInfo.industryIdentifiers!.find(
        ({ type }) => type === 'ISBN_13',
      )!.identifier
      return { name: `volumes/${name}`, isbn13, body: searchBody([recorded]), matches: true }
    })

  it.each([...searches, ...volumes])('$name', async ({ isbn13, body, matches }) => {
    serve(body)

    const results = await google.lookupByIsbn(isbn13)

    if (matches) expect(results.length).toBeGreaterThan(0)
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
