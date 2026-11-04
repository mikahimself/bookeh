import { readFileSync } from 'node:fs'

import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '@/lib/errors'
import { allowsCoverUrl, coverPolicy, fetchCover } from '@/lib/catalogue/covers'
import { mergeResults } from '@/lib/metadata/merge'
import { finnaResults } from '@/lib/metadata/sources/finna'
import {
  hardcover,
  hardcoverEditionsRequest,
  hardcoverResults,
  hardcoverSearchHits,
  hardcoverSearchIds,
} from '@/lib/metadata/sources/hardcover'

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/hardcover/${name}.json`, import.meta.url), 'utf8'),
  ) as unknown
const serve = (body: unknown, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body, { status })),
  )

beforeEach(() => {
  vi.stubEnv('HARDCOVER_API_TOKEN', 'fixture-only-token')
  vi.spyOn(logger(), 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Hardcover catalogue source', () => {
  it('joins source order only when its token exists at module load', async () => {
    vi.stubEnv('OPEN_LIBRARY_CONTACT', 'test@example.invalid')
    vi.stubEnv('HARDCOVER_API_TOKEN', '')
    vi.resetModules()
    expect(
      (await import('@/lib/metadata/sources/index')).sources.map((source) => source.id),
    ).toEqual(['finna', 'google', 'openlibrary'])
    vi.stubEnv('HARDCOVER_API_TOKEN', 'fixture-only-token')
    vi.resetModules()
    expect(
      (await import('@/lib/metadata/sources/index')).sources.map((source) => source.id),
    ).toEqual(['finna', 'google', 'openlibrary', 'hardcover'])
  })
  it('maps recorded English and Finnish editions and the answered miss', () => {
    const english = hardcoverResults(fixture('9780007448036'), '9780007448036')!
    expect(english).toHaveLength(1)
    expect(english[0]).toMatchObject({
      recordId: '25383277',
      pages: 801,
      publisher: 'HarperCollins UK',
      authors: [{ name: 'George R.R. Martin' }],
      source: 'hardcover',
      themes: [],
    })
    expect(english[0].description).toContain('Lord Eddard Stark')
    expect(english[0].coverUrl).toMatch(/^https:\/\/assets\.hardcover\.app\//)
    const finnish = hardcoverResults(fixture('9789511319177'), '9789511319177')!
    expect(finnish[0]).toMatchObject({ authors: [{ name: 'Olli Jalonen' }], pages: 461 })
    expect(finnish[0]).not.toHaveProperty('description')
    expect(hardcoverResults(fixture('9789517685535'), '9789517685535')).toEqual([])
  })

  it('maps an edition physical format to display-only binding', () => {
    const body = {
      data: {
        editions: [
          { id: 9, isbn_13: '9780007448036', title: 'A book', physical_format: 'Hardcover' },
        ],
      },
    }
    expect(hardcoverResults(body, '9780007448036')?.[0].binding).toBe('Hardcover')
  })

  it('gap-fills a direct cover while Finna keeps its fields and identity', () => {
    const finnaBody: unknown = JSON.parse(
      readFileSync(new URL('../fixtures/finna/9789511319177.json', import.meta.url), 'utf8'),
    )
    const finna = finnaResults(finnaBody, '9789511319177')!
    const hardcover = hardcoverResults(fixture('9789511319177'), '9789511319177')!
    const merged = mergeResults([finna, hardcover])!.result
    expect(merged.source).toBe('finna')
    expect(merged.recordId).toBe(finna[0].recordId)
    expect(merged.title).toBe(finna[0].title)
    expect(merged.coverUrl).toBe(hardcover[0].coverUrl)
    expect(allowsCoverUrl(new URL(merged.coverUrl!))).toBe(true)
  })

  it('uses one POST with exact ISBN and never puts the token in the URL', async () => {
    const fetch = vi.fn(async () => Response.json(fixture('9780007448036')))
    vi.stubGlobal('fetch', fetch)
    expect(await hardcover.lookupByIsbn('9780007448036')).toHaveLength(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.hardcover.app/v1/graphql')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body)).variables).toEqual({ isbn: '9780007448036' })
    expect(init.headers).toMatchObject({ Authorization: 'Bearer fixture-only-token' })
  })

  it('reports a malformed envelope, GraphQL errors and auth failure without credentials', async () => {
    expect(hardcoverResults([], '9780007448036')).toBeUndefined()
    expect(
      hardcoverResults(
        { data: { editions: [{ isbn_13: '9780007448036', title: 'No id' }] } },
        '9780007448036',
      ),
    ).toEqual([])
    serve({ errors: [{ message: 'private details' }] })
    expect(await hardcover.lookupByIsbn('9780007448036')).toBeUndefined()
    serve({}, 403)
    expect(await hardcover.lookupByIsbn('9780007448036')).toBeUndefined()
    const calls = vi.mocked(logger().warn).mock.calls
    expect(JSON.stringify(calls)).not.toContain('fixture-only-token')
    expect(JSON.stringify(calls)).toContain('renew HARDCOVER_API_TOKEN')
  })

  it('resolves search book IDs to edition ISBNs and ignores work-wide ISBN lists', async () => {
    const body = fixture('search/tuntematon-sotilas') as { search: unknown; editions: unknown }
    const ids = hardcoverSearchIds(body.search, 'tuntematon sotilas')
    const hits = hardcoverSearchHits(body.editions, ids, 'tuntematon sotilas')
    expect(hits.length).toBeGreaterThan(0)
    expect(new Set(hits.map((hit) => hit.isbn13)).size).toBe(hits.length)
    expect(hits.every((hit) => hit.source === 'hardcover')).toBe(true)
    expect(hits.some((hit) => hit.coverUrl?.startsWith('https://assets.hardcover.app/'))).toBe(true)
    const fetch = vi.fn(async (_url: string, init: RequestInit) =>
      Response.json(
        JSON.parse(String(init.body)).query.includes('HardcoverEditions')
          ? body.editions
          : body.search,
      ),
    )
    vi.stubGlobal('fetch', fetch)
    expect(await hardcover.search!('tuntematon sotilas')).toEqual(hits)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(await hardcover.search!('   ')).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(
      hardcoverSearchIds(fixture('search/qwzxvb-kirjaton-teos-12345') as unknown, 'nonsense'),
    ).toEqual([])
  })

  it('aborts a slow search request before the outer source timeout', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(
      async (_url: string | URL, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const result = hardcover.search!('slow query')
    await vi.advanceTimersByTimeAsync(1_800)
    await expect(result).resolves.toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('never assigns a work ISBN to a different edition', () => {
    const search = {
      data: {
        search: {
          results: {
            hits: [
              {
                document: { id: '42', isbns: ['9780007448036', '9789511319177'] },
                text_match_info: { num_tokens_dropped: 0 },
              },
            ],
          },
        },
      },
    }
    const ids = hardcoverSearchIds(search, 'work')
    const editions = {
      data: {
        books: [
          {
            id: 42,
            editions: [
              {
                id: 1,
                book_id: 42,
                isbn_13: '9780007448036',
                title: 'English edition',
                publisher: { name: 'English publisher' },
                physical_format: 'Paperback',
                book: {
                  contributions: [
                    { contributor_role_id: 1, author: { name: 'The Author' } },
                    { contributor_role_id: 2, author: { name: 'The Narrator' } },
                  ],
                },
              },
              {
                id: 2,
                book_id: 42,
                isbn_13: '9789511319177',
                title: 'Finnish edition',
                publisher: { name: 'Finnish publisher' },
              },
            ],
          },
        ],
      },
    }
    expect(hardcoverSearchHits(editions, ids, 'work')).toMatchObject([
      {
        isbn13: '9780007448036',
        title: 'English edition',
        publisher: 'English publisher',
        binding: 'Paperback',
        authors: [{ name: 'The Author' }],
      },
      { isbn13: '9789511319177', title: 'Finnish edition', publisher: 'Finnish publisher' },
    ])
  })

  it('gives a later search book its own edition limit', () => {
    const ids = [42, 43]
    const request = hardcoverEditionsRequest(ids)
    expect(request.variables).toEqual({ ids })
    expect(request.query).toContain('books(where: { id: { _in: $ids } })')
    expect(request.query).toContain('limit: 20')
    const body = {
      data: {
        books: [
          {
            id: 42,
            editions: Array.from({ length: 20 }, (_, index) => ({
              id: index + 1,
              book_id: 42,
              isbn_13: '9780007448036',
              title: 'First work',
            })),
          },
          {
            id: 43,
            editions: [{ id: 30, book_id: 43, isbn_13: '9789511319177', title: 'Second work' }],
          },
        ],
      },
    }
    expect(hardcoverSearchHits(body, ids, 'query').map((hit) => hit.title)).toEqual([
      'First work',
      'Second work',
    ])
  })

  it('keeps valid search books when another book is malformed', () => {
    const body = {
      data: {
        books: [
          { id: 42, editions: 'bad' },
          {
            id: 43,
            editions: [{ id: 1, book_id: 43, isbn_13: '9789511319177', title: 'Valid work' }],
          },
        ],
      },
    }
    expect(hardcoverSearchHits(body, [42, 43], 'query')).toMatchObject([
      { isbn13: '9789511319177', title: 'Valid work' },
    ])
  })

  it('downloads a recorded Hardcover cover through the production policy', async () => {
    const coverUrl = hardcoverResults(fixture('9789511319177'), '9789511319177')![0].coverUrl!
    const bytes = await sharp({
      create: { width: 2, height: 3, channels: 3, background: '#123456' },
    })
      .jpeg()
      .toBuffer()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/jpeg' } })),
    )
    await expect(fetchCover(coverUrl, coverPolicy)).resolves.toMatchObject({
      ok: true,
      mimeType: 'image/jpeg',
      width: 2,
      height: 3,
    })
  })
})
