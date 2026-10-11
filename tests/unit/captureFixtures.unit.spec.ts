import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildReport,
  capture,
  finnaMatches,
  GOOGLE_HEALTH_ISBN,
  readIsbnList,
  toIsbn13,
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
    expect(toIsbn13('951-578-275-9')).toBe('9789515782755')
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

  it('makes no request when every fixture exists', async () => {
    const dir = await tempDir()
    for (const source of ['finna', 'google']) {
      await mkdir(join(dir, source))
      await writeFile(join(dir, source, '9789520408053.json'), '{}\n')
    }
    const fetchFn = vi.fn<FetchFn>()

    const { notCaptured } = await capture(['9789520408053'], dir, fetchFn, noSleep, KEY)

    expect(fetchFn).not.toHaveBeenCalled()
    expect(notCaptured).toEqual([])
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
})
