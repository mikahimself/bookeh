import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { finnaMatches } from '@/lib/metadata/sources/finna'

import {
  buildReport,
  capture,
  GOOGLE_HEALTH_ISBN,
  querySlug,
  readIsbnList,
  readQueryList,
  type FetchFn,
} from '../../scripts/capture-fixtures'

const noSleep = async () => {}
const KEY = 'TEST_KEY'
const CONTACT = 'tester@example.test'
const OPTS = { googleKey: KEY, contact: CONTACT }
const isGoogle = (url: string) => url.startsWith('https://www.googleapis.com/')
const isOpenLibrary = (url: string) => url.startsWith('https://openlibrary.org/')
const dirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bookeh-fixtures-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('ISBN list', () => {
  it('turns an ISBN-10 with hyphens into its ISBN-13', () => {
    expect(readIsbnList('# shelf\n951-578-275-9\n\n')).toEqual([
      { listed: '951-578-275-9', isbn13: '9789515782755' },
    ])
  })

  it('refuses a wrong check digit, naming the line', () => {
    expect(() => readIsbnList('9789520408053\n978-952-04-0805-4\n')).toThrow(
      /line 2: "978-952-04-0805-4"/,
    )
  })
})

describe('query list', () => {
  it('skips comments and blank lines, and slugs each query for its file name', () => {
    const queries = readQueryList('# notes\n\ntuntematon  sotilas\nHarari, Yuval Noah # author\n')

    expect(queries).toEqual(['tuntematon sotilas', 'Harari, Yuval Noah'])
    expect(queries.map(querySlug)).toEqual(['tuntematon-sotilas', 'harari-yuval-noah'])
  })

  it('refuses two queries that share a fixture, and one with no file name, naming the line', () => {
    expect(() => readQueryList('tuntematon sotilas\nTuntematon Sotilas!\n')).toThrow(
      /line 2: "Tuntematon Sotilas!" has the same fixture as "tuntematon sotilas" \(tuntematon-sotilas\.json\)/,
    )
    expect(() => readQueryList('sapiens\n???\n')).toThrow(
      /line 2: "\?\?\?" has no usable file name/,
    )
  })
})

describe('Finna matching', () => {
  it('counts only the records whose isbns carry the ISBN asked for', async () => {
    const body: unknown = JSON.parse(
      await readFile(new URL('../fixtures/finna/9789520408053.json', import.meta.url), 'utf8'),
    )
    expect((body as { records: unknown[] }).records.length).toBeGreaterThan(1)
    const matches = finnaMatches(body, '9789520408053')
    expect(matches).toHaveLength(1)
    expect(matches[0].isbns).toContain('978-952-04-0805-3 kovakantinen')
  })
})

describe('capture', () => {
  it('writes nothing for a source still failing after four attempts', async () => {
    const dir = await tempDir()
    const fetchFn = vi.fn<FetchFn>(async () => new Response('{"error":{}}', { status: 503 }))

    const { notCaptured } = await capture(['9789520408053'], dir, fetchFn, noSleep, OPTS)

    // Four for the Google health check, four for Finna, four for Open Library; Google is
    // then skipped.
    expect(fetchFn).toHaveBeenCalledTimes(12)
    expect(notCaptured.map((n) => [n.source, n.isbn13])).toEqual([
      ['finna', '9789520408053'],
      ['google', '9789520408053'],
      ['openlibrary', '9789520408053'],
    ])
    expect(await readdir(join(dir, 'finna'))).toEqual([])
    expect(await readdir(join(dir, 'google'))).toEqual([])
    expect(await readdir(join(dir, 'openlibrary'))).toEqual([])
  })

  it('identifies every Open Library request, and skips the source without a contact', async () => {
    const dir = await tempDir()
    const fetchFn = vi.fn<FetchFn>(async (url) =>
      Response.json(isOpenLibrary(url) ? {} : { resultCount: 0, status: 'OK' }),
    )

    await capture(['9789520408053'], dir, fetchFn, noSleep, {
      contact: CONTACT,
      queries: ['tuntematon sotilas'],
    })

    const openLibraryCalls = fetchFn.mock.calls.filter(([url]) => isOpenLibrary(url))
    expect(openLibraryCalls).toHaveLength(2) // one lookup, one search
    for (const [, init] of openLibraryCalls) {
      expect(init.headers).toMatchObject({ 'User-Agent': `bookeh (${CONTACT})` })
    }
    // The contact is never written to a fixture.
    for (const file of await readdir(join(dir, 'openlibrary'), { recursive: true })) {
      if (file.endsWith('.json')) {
        expect(await readFile(join(dir, 'openlibrary', file), 'utf8')).not.toContain(CONTACT)
      }
    }

    const bare = await tempDir()
    const bareFetch = vi.fn<FetchFn>(async () => Response.json({ resultCount: 0, status: 'OK' }))
    const { notCaptured } = await capture(['9789520408053'], bare, bareFetch, noSleep, {
      queries: ['tuntematon sotilas'],
    })

    expect(bareFetch.mock.calls.some(([url]) => isOpenLibrary(url))).toBe(false)
    expect(notCaptured.map((n) => [n.source, n.reason])).toEqual([
      ['google', expect.stringContaining('Google health check failed')],
      ['openlibrary', 'OPEN_LIBRARY_CONTACT is not set'],
      ['openlibrary', 'OPEN_LIBRARY_CONTACT is not set'],
    ])
  })

  it('stores no Google response in a run where Google cannot find a book it knows', async () => {
    const dir = await tempDir()
    const fetchFn = vi.fn<FetchFn>(async (url) =>
      Response.json(
        isGoogle(url)
          ? { kind: 'books#volumes', totalItems: 0 }
          : isOpenLibrary(url)
            ? {}
            : { resultCount: 0, status: 'OK' },
      ),
    )

    const { notCaptured } = await capture(['9789520408053'], dir, fetchFn, noSleep, OPTS)

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining(GOOGLE_HEALTH_ISBN),
      expect.anything(),
    )
    expect(await readdir(join(dir, 'finna'))).toEqual(['9789520408053.json'])
    expect(await readdir(join(dir, 'google'))).toEqual([])
    expect(await readdir(join(dir, 'openlibrary'))).toEqual(['9789520408053.json'])
    expect(notCaptured).toEqual([
      expect.objectContaining({ source: 'google', isbn13: '9789520408053' }),
    ])
  })

  it("stores every source's response when Google finds the books", async () => {
    const dir = await tempDir()
    const fetchFn = vi.fn<FetchFn>(async (url) => {
      if (isOpenLibrary(url)) return Response.json({})
      if (!isGoogle(url)) {
        return Response.json({ resultCount: 0, status: 'OK' })
      }
      const isbn13 = new URL(url).searchParams.get('q')?.replace('isbn:', '')
      return Response.json({
        kind: 'books#volumes',
        totalItems: 1,
        items: [{ volumeInfo: { industryIdentifiers: [{ type: 'ISBN_13', identifier: isbn13 }] } }],
      })
    })

    const { notCaptured, written } = await capture(['9789520408053'], dir, fetchFn, noSleep, OPTS)

    expect(notCaptured).toEqual([])
    expect(written).toBe(3)
    for (const source of ['finna', 'google', 'openlibrary']) {
      expect(await readdir(join(dir, source))).toEqual(['9789520408053.json'])
    }
  })

  it('makes no request when every fixture exists, searches included', async () => {
    const dir = await tempDir()
    for (const source of ['finna', 'google', 'openlibrary']) {
      await mkdir(join(dir, source))
      await writeFile(join(dir, source, '9789520408053.json'), '{}\n')
    }
    for (const source of ['finna', 'openlibrary']) {
      await mkdir(join(dir, source, 'search'))
      await writeFile(join(dir, source, 'search', 'tuntematon-sotilas.json'), '{}\n')
    }
    const fetchFn = vi.fn<FetchFn>()

    const { notCaptured } = await capture(['9789520408053'], dir, fetchFn, noSleep, {
      ...OPTS,
      queries: ['tuntematon sotilas'],
    })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(notCaptured).toEqual([])
  })

  it('records a missing search query under its slug and writes nothing for a failure', async () => {
    const dir = await tempDir()
    // Google is down for this run, and Finna answers everything but the second query.
    const fetchFn = vi.fn<FetchFn>(async (url) => {
      if (isGoogle(url)) return new Response('', { status: 503 })
      if (isOpenLibrary(url)) return Response.json({})
      if (new URL(url).searchParams.get('lookfor') === 'ei löydy') {
        return new Response('oops', { status: 404 })
      }
      return Response.json({ resultCount: 0, status: 'OK' })
    })

    const { notCaptured, written } = await capture(['9789520408053'], dir, fetchFn, noSleep, {
      ...OPTS,
      queries: ['tuntematon sotilas', 'ei löydy'],
    })

    // Two lookups (Finna, Open Library) and three of the four search fixtures.
    expect(written).toBe(5)
    expect(await readdir(join(dir, 'finna', 'search'))).toEqual(['tuntematon-sotilas.json'])
    expect(await readdir(join(dir, 'openlibrary', 'search'))).toEqual([
      'ei-loydy.json',
      'tuntematon-sotilas.json',
    ])
    expect(notCaptured).toEqual([
      expect.objectContaining({ source: 'google', isbn13: '9789520408053' }),
      expect.objectContaining({ source: 'finna', query: 'ei löydy' }),
    ])
  })
})

describe('buildReport', () => {
  it('decides D-2 from matched Google volumes only, and not while a response is missing', async () => {
    const dir = await tempDir()
    const volume = (identifier: string) => ({
      kind: 'books#volumes',
      totalItems: 1,
      items: [
        {
          volumeInfo: {
            industryIdentifiers: [{ type: 'ISBN_13', identifier }],
            categories: ['Fiction'],
          },
        },
      ],
    })
    const fixtures = {
      finna: { a: { resultCount: 0, records: [] }, b: { resultCount: 0, records: [] } },
      // b's only item carries categories under another ISBN, so it does not count.
      google: { a: volume('9789520408053'), b: volume(GOOGLE_HEALTH_ISBN) },
    }
    const isbns = [
      { listed: 'a', isbn13: '9789520408053' },
      { listed: 'b', isbn13: '9789515782755' },
    ]
    for (const source of ['finna', 'google'] as const) {
      await mkdir(join(dir, source))
      for (const [i, { isbn13 }] of isbns.entries()) {
        const body = fixtures[source][i === 0 ? 'a' : 'b']
        await writeFile(join(dir, source, `${isbn13}.json`), JSON.stringify(body))
      }
    }

    const decided = await buildReport(isbns, dir, '2026-10-11')
    expect(decided.markdown).toContain('Google categories cover 1 of 2 books')
    expect(decided.markdown).toContain('at least half')

    await rm(join(dir, 'google', '9789515782755.json'))
    const undecided = await buildReport(isbns, dir, '2026-10-11')
    expect(undecided.markdown).toContain('Not decided')
  })

  it('names the search request, its fields and a row per recorded query and source', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'finna', 'search'), { recursive: true })
    await mkdir(join(dir, 'openlibrary', 'search'), { recursive: true })
    // One work, one edition doc carrying both forms of one ISBN: one hit.
    await writeFile(
      join(dir, 'openlibrary', 'search', 'tuntematon-sotilas.json'),
      JSON.stringify({
        numFound: 1,
        docs: [
          {
            key: '/works/OL4223922W',
            title: 'Tuntematon sotilas',
            author_name: ['Väinö Linna'],
            editions: {
              docs: [
                {
                  key: '/books/OL4510970M',
                  title: 'Tuntematon sotilas',
                  isbn: ['9519912061', '9789519912066'],
                },
              ],
            },
          },
        ],
      }),
    )
    // Three records, one of them without an ISBN: two hits.
    await writeFile(
      join(dir, 'finna', 'search', 'tuntematon-sotilas.json'),
      JSON.stringify({
        resultCount: 7545,
        status: 'OK',
        records: [
          { id: 'a', shortTitle: 'Tuntematon sotilas', isbns: ['951-0-02405-8'] },
          { id: 'b', shortTitle: 'Tuntematon sotilas', isbns: ['978-951-0-43251-8 kovakantinen'] },
          { id: 'c', shortTitle: 'Tuntematon sotilas', isbns: [] },
        ],
      }),
    )

    const { markdown, missing } = await buildReport(
      [],
      dir,
      '2026-11-01',
      [],
      ['tuntematon sotilas', 'ei löydy'],
    )

    expect(markdown).toContain('- Finna search: `GET https://api.finna.fi/api/v1/search?lookfor=')
    expect(markdown).toContain('- Open Library search: `GET https://openlibrary.org/search.json?q=')
    expect(markdown).toContain('Finna search fields: `id`, `title`')
    expect(markdown).toContain('Open Library search fields: `key`, `title`')
    expect(markdown).toContain('| tuntematon sotilas | finna | tuntematon-sotilas.json | 3 | 2 |')
    expect(markdown).toContain(
      '| tuntematon sotilas | openlibrary | tuntematon-sotilas.json | 1 | 1 |',
    )
    expect(markdown).toContain('| ei löydy | finna | not captured | – | – |')
    expect(markdown).toContain('| ei löydy | openlibrary | not captured | – | – |')
    expect(missing).toEqual([
      expect.objectContaining({ source: 'finna', query: 'ei löydy', reason: 'no fixture on disk' }),
      expect.objectContaining({
        source: 'openlibrary',
        query: 'ei löydy',
        reason: 'no fixture on disk',
      }),
    ])
  })
})
