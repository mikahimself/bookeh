import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { fetchCoverPreview } from '@/lib/catalogue/coverPreview'
import type { CoverPolicy } from '@/lib/catalogue/covers'
import { LOOKUP_LIMIT } from '@/lib/catalogue/lookupLimit'
import { searchBooks } from '@/lib/catalogue/searchBooks'
import { DomainError, logger } from '@/lib/errors'
import { SOURCE_TIMEOUT_MS } from '@/lib/metadata/lookup'
import type { SearchHit, Source } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import { processState } from '@/lib/processState'

// Spine, AD-9 and AD-14: search across the sources. Fake sources through
// `vi.mock('@/lib/metadata/sources')`, the pattern `lookup.unit.spec.ts` uses;
// no network in this lane.

const fakes = vi.hoisted(() => [] as Source[])
vi.mock('@/lib/metadata/sources', () => ({ sources: fakes }))

const ISBN = (n: number) => `978951039626${n}`
const COVER = 'https://covers.example.test/1.jpg'

type Answer = SearchHit[] | 'hang' | 'reject' | 'nosearch'

/** A hit of `source`; `coverUrl` is left out when absent, as an adapter leaves it out. */
const hit = (source: string, isbn13: string, extra: Partial<SearchHit> = {}): SearchHit => ({
  isbn13,
  title: `${source} ${isbn13}`,
  authors: [{ name: 'Tove Jansson' }],
  source,
  ...extra,
})

/** Installs one fake per answer, ids A, B, ...; `nosearch` has no `search` at all. */
function serve(...answers: Answer[]) {
  fakes.length = 0
  return answers.map((answer, i) => {
    const id = String.fromCharCode(65 + i)
    const lookupByIsbn = vi.fn(async () => undefined)
    if (answer === 'nosearch') {
      fakes.push({ id, lookupByIsbn })
      return vi.fn<(query: string) => Promise<SearchHit[]>>()
    }
    const search = vi.fn((): Promise<SearchHit[]> => {
      if (answer === 'hang') return new Promise(() => {})
      if (answer === 'reject') return Promise.reject(new Error('contract breach'))
      return Promise.resolve(answer)
    })
    fakes.push({ id, lookupByIsbn, search })
    return search
  })
}

const ctx = (id = 1) =>
  ({ user: { id }, req: { payload: { logger: { warn: vi.fn() } } } }) as unknown as Context

const count = (userId = 1) =>
  processState('catalogue.lookupLimit', () => new Map<number, { count: number }>()).get(userId)
    ?.count ?? 0

let warn: MockInstance

beforeEach(() => {
  processState('catalogue.lookupLimit', () => new Map()).clear()
  processState('catalogue.coverPreviews', () => new Map()).clear()
  warn = vi.spyOn(logger(), 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('searchBooks merge', () => {
  it('answers drafts in source order, one per ISBN-13, with no cover URL', async () => {
    serve([hit('A', ISBN(1)), hit('A', ISBN(2))], [hit('B', ISBN(3))])

    const drafts = await searchBooks(ctx(), 'tove')

    expect(drafts.map(({ isbn13 }) => isbn13)).toStrictEqual([ISBN(1), ISBN(2), ISBN(3)])
    expect(drafts[0]).toStrictEqual({
      isbn13: ISBN(1),
      title: `A ${ISBN(1)}`,
      authors: [{ name: 'Tove Jansson' }],
      source: 'A',
      hasCover: false,
    })
    expect(drafts.every((draft) => !('coverUrl' in draft))).toBe(true)
  })

  it('keeps the first source for a shared ISBN-13 but takes the later cover', async () => {
    serve([hit('A', ISBN(1))], [hit('B', ISBN(1), { coverUrl: COVER })])

    const drafts = await searchBooks(ctx(), 'tove')

    expect(drafts).toStrictEqual([
      {
        isbn13: ISBN(1),
        title: `A ${ISBN(1)}`,
        authors: [{ name: 'Tove Jansson' }],
        source: 'A',
        hasCover: true,
      },
    ])
  })

  it('keeps the hits of a later source when an earlier one answers nothing', async () => {
    serve([], [hit('B', ISBN(3)), hit('B', ISBN(2))])

    const drafts = await searchBooks(ctx(), 'tove')

    expect(drafts.map(({ isbn13 }) => isbn13)).toStrictEqual([ISBN(3), ISBN(2)])
  })

  it('asks only the sources that implement search', async () => {
    const [asked] = serve([hit('A', ISBN(1))], 'nosearch')

    const drafts = await searchBooks(ctx(), 'tove')

    expect(asked).toHaveBeenCalledWith('tove')
    expect(drafts.map(({ source }) => source)).toStrictEqual(['A'])
  })

  it('drops a hit without an ISBN-13', async () => {
    serve([hit('A', ''), hit('A', ISBN(1))])

    const drafts = await searchBooks(ctx(), 'tove')

    expect(drafts.map(({ isbn13 }) => isbn13)).toStrictEqual([ISBN(1)])
  })

  it('answers nothing when every source does', async () => {
    serve([], [])

    await expect(searchBooks(ctx(), 'tove')).resolves.toStrictEqual([])
  })
})

describe('searchBooks when a source fails', () => {
  it('answers the other source after a timeout, with one warning', async () => {
    vi.useFakeTimers()
    serve('hang', [hit('B', ISBN(3))])

    const running = searchBooks(ctx(), 'tove')
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS)

    await expect(running).resolves.toMatchObject([{ isbn13: ISBN(3), source: 'B' }])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatchObject({ source: 'A', query: 'tove' })
  })

  it('answers the other source when one rejects, with one warning', async () => {
    serve('reject', [hit('B', ISBN(3))])

    await expect(searchBooks(ctx(), 'tove')).resolves.toMatchObject([{ source: 'B' }])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatchObject({ source: 'A', query: 'tove' })
  })

  it('answers nothing, without throwing, when every source fails', async () => {
    vi.useFakeTimers()
    serve('hang', 'reject')

    const running = searchBooks(ctx(), 'tove')
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS)

    await expect(running).resolves.toStrictEqual([])
    expect(warn).toHaveBeenCalledTimes(2)
  })
})

describe('searchBooks and the lookup limit', () => {
  it('answers blank text with nothing, asking no source and counting nothing', async () => {
    const [asked] = serve([hit('A', ISBN(1))])

    await expect(searchBooks(ctx(), '   ')).resolves.toStrictEqual([])
    expect(asked).not.toHaveBeenCalled()
    expect(count()).toBe(0)
  })

  it('counts one lookup per call however many sources answer', async () => {
    serve([hit('A', ISBN(1))], [hit('B', ISBN(2))])

    await searchBooks(ctx(), 'tove')

    expect(count()).toBe(1)
  })

  it('refuses once the window is spent, before any source is asked', async () => {
    const [asked] = serve([hit('A', ISBN(1))])
    for (let i = 0; i < LOOKUP_LIMIT; i++) await searchBooks(ctx(), 'tove')
    asked.mockClear()

    await expect(searchBooks(ctx(), 'tove')).rejects.toThrow(DomainError)
    expect(asked).not.toHaveBeenCalled()
  })
})

describe('searchBooks and the cover preview', () => {
  const jpeg = () =>
    sharp({ create: { width: 20, height: 30, channels: 3, background: '#223344' } })
      .jpeg()
      .toBuffer()

  const policy: CoverPolicy = { allows: () => true, maxBytes: 5_000_000, timeoutMs: 5_000 }

  it('records a hit cover URL, so the preview route can serve it', async () => {
    const bytes = await jpeg()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/jpeg' } })),
    )
    serve([hit('A', ISBN(1), { coverUrl: COVER })])
    const as = ctx()

    const drafts = await searchBooks(as, 'tove')

    expect(drafts[0]!.hasCover).toBe(true)
    const served = await fetchCoverPreview(as, ISBN(1), policy, 0, 'search')
    expect(served?.mimeType).toBe('image/jpeg')
    vi.unstubAllGlobals()
  })

  it('records nothing for a hit without a cover', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    serve([hit('A', ISBN(1))])
    const as = ctx()

    const drafts = await searchBooks(as, 'tove')

    expect(drafts[0]!.hasCover).toBe(false)
    await expect(fetchCoverPreview(as, ISBN(1), policy, 0, 'search')).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
