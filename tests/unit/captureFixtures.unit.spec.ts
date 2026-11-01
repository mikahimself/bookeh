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

    const { notCaptured } = await capture(['9789520408053'], dir, fetchFn, noSleep, KEY)

    // Four for the Google health check, four for Finna; Google is then skipped.
    expect(fetchFn).toHaveBeenCalledTimes(8)
    expect(notCaptured.map((n) => [n.source, n.isbn13])).toEqual([
      ['finna', '9789520408053'],
      ['google', '9789520408053'],
    ])
    expect(await readdir(join(dir, 'finna'))).toEqual([])
    expect(await readdir(join(dir, 'google'))).toEqual([])
  })

  it('stores no Google response in a run where Google cannot find a book it knows', async () => {
    const dir = await tempDir()
    const fetchFn = vi.fn<FetchFn>(async (url) =>
      Response.json(
        url.startsWith('https://www.googleapis.com/')
          ? { kind: 'books#volumes', totalItems: 0 }
          : { resultCount: 0, status: 'OK' },
      ),
    )

    const { notCaptured } = await capture(['9789520408053'], dir, fetchFn, noSleep, KEY)

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining(GOOGLE_HEALTH_ISBN),
      expect.anything(),
    )
    expect(await readdir(join(dir, 'finna'))).toEqual(['9789520408053.json'])
    expect(await readdir(join(dir, 'google'))).toEqual([])
    expect(notCaptured).toEqual([
      expect.objectContaining({ source: 'google', isbn13: '9789520408053' }),
    ])
  })

  it('stores both responses when Google finds the books', async () => {
    const dir = await tempDir()
    const fetchFn = vi.fn<FetchFn>(async (url) => {
      if (!url.startsWith('https://www.googleapis.com/')) {
        return Response.json({ resultCount: 0, status: 'OK' })
      }
      const isbn13 = new URL(url).searchParams.get('q')?.replace('isbn:', '')
      return Response.json({
        kind: 'books#volumes',
        totalItems: 1,
        items: [{ volumeInfo: { industryIdentifiers: [{ type: 'ISBN_13', identifier: isbn13 }] } }],
      })
    })

    const { notCaptured, written } = await capture(['9789520408053'], dir, fetchFn, noSleep, KEY)

    expect(notCaptured).toEqual([])
    expect(written).toBe(2)
    expect(await readdir(join(dir, 'finna'))).toEqual(['9789520408053.json'])
    expect(await readdir(join(dir, 'google'))).toEqual(['9789520408053.json'])
  })

  it('makes no request when every fixture exists, searches included', async () => {
    const dir = await tempDir()
    for (const source of ['finna', 'google']) {
      await mkdir(join(dir, source))
      await writeFile(join(dir, source, '9789520408053.json'), '{}\n')
    }
    await mkdir(join(dir, 'finna', 'search'))
    await writeFile(join(dir, 'finna', 'search', 'tuntematon-sotilas.json'), '{}\n')
    const fetchFn = vi.fn<FetchFn>()

    const { notCaptured } = await capture(['9789520408053'], dir, fetchFn, noSleep, KEY, [
      'tuntematon sotilas',
    ])

    expect(fetchFn).not.toHaveBeenCalled()
    expect(notCaptured).toEqual([])
  })

  it('records a missing search query under its slug and writes nothing for a failure', async () => {
    const dir = await tempDir()
    // Google is down for this run, and Finna answers everything but the second query.
    const fetchFn = vi.fn<FetchFn>(async (url) => {
      if (url.startsWith('https://www.googleapis.com/')) return new Response('', { status: 503 })
      if (new URL(url).searchParams.get('lookfor') === 'ei löydy') {
        return new Response('oops', { status: 404 })
      }
      return Response.json({ resultCount: 0, status: 'OK' })
    })

    const { notCaptured, written } = await capture(['9789520408053'], dir, fetchFn, noSleep, KEY, [
      'tuntematon sotilas',
      'ei löydy',
    ])

    expect(written).toBe(2)
    expect(await readdir(join(dir, 'finna', 'search'))).toEqual(['tuntematon-sotilas.json'])
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

  it('names the search request, its fields and a row per recorded query', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'finna', 'search'), { recursive: true })
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
    expect(markdown).toContain('Finna search fields: `id`, `title`')
    expect(markdown).toContain('| tuntematon sotilas | tuntematon-sotilas.json | 3 | 2 |')
    expect(markdown).toContain('| ei löydy | not captured | – | – |')
    expect(missing).toEqual([
      expect.objectContaining({ source: 'finna', query: 'ei löydy', reason: 'no fixture on disk' }),
    ])
  })
})
