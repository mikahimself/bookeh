import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { logger } from '@/lib/errors'
import {
  BREAKER_COOLDOWN_MS,
  BREAKER_FAILURES,
  CACHE_SIZE,
  FOUND_TTL_MS,
  heldOutcome,
  lookupSources,
  NONE_TTL_MS,
  PARTIAL_TTL_MS,
  SOURCE_TIMEOUT_MS,
} from '@/lib/metadata/lookup'
import { mergeResults } from '@/lib/metadata/merge'
import type { Source, SourceResult } from '@/lib/metadata/source'
import { processState } from '@/lib/processState'

const fakes = vi.hoisted(() => [] as Source[])
vi.mock('@/lib/metadata/sources', () => ({ sources: fakes }))

const ISBN = '9789510396266'
const NOW = new Date('2026-10-12T08:00:00.000Z')

type Answer = SourceResult[] | undefined | 'hang' | 'reject'

/** A record of `source`; `extra` fills fields the merge can gap-fill. */
const rec = (source: string, title: string, extra: Partial<SourceResult> = {}): SourceResult => ({
  isbn13: ISBN,
  title,
  authors: [{ name: 'Tove Jansson' }],
  subjects: [],
  themes: [],
  source,
  recordId: `${source}-${title}`,
  raw: { [source]: title },
  ...extra,
})

/** Installs one fake per answer, ids A, B, ...; each answer is used for every lookup. */
function serve(...answers: Answer[]) {
  fakes.length = 0
  const mocks = answers.map((answer, i) => {
    const lookupByIsbn = vi.fn((): Promise<SourceResult[] | undefined> => {
      if (answer === 'hang') return new Promise(() => {})
      if (answer === 'reject') return Promise.reject(new Error('contract breach'))
      return Promise.resolve(answer)
    })
    fakes.push({ id: String.fromCharCode(65 + i), lookupByIsbn })
    return lookupByIsbn
  })
  return mocks
}

const merged = (...lists: SourceResult[][]) => mergeResults(lists, NOW)!

let warn: MockInstance

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  processState('metadata.cache', () => new Map()).clear()
  processState('metadata.breaker', () => new Map()).clear()
  warn = vi.spyOn(logger(), 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('lookupSources', () => {
  it('builds one candidate per record of the first source, gap-filled, and caches it', async () => {
    const a1 = rec('A', 'a1')
    const a2 = rec('A', 'a2')
    const b1 = rec('B', 'b1', { pages: 300, coverUrl: 'https://example.test/b1.jpg' })
    const [a, b] = serve([a1, a2], [b1])

    const outcome = await lookupSources(ISBN)

    const first = merged([a1], [b1])
    expect(outcome).toEqual({
      kind: 'found',
      failed: [],
      candidates: [first.result, merged([a2], [b1]).result],
      raw: first.raw,
    })
    expect(await lookupSources(ISBN)).toEqual(outcome)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })

  it('takes the candidates from the first source with records', async () => {
    const b1 = rec('B', 'b1')
    const b2 = rec('B', 'b2')
    serve([], [b1, b2])

    const outcome = await lookupSources(ISBN)

    expect(outcome).toMatchObject({ kind: 'found', candidates: [{ title: 'b1' }, { title: 'b2' }] })
    expect(outcome.kind === 'found' && outcome.candidates.map((c) => c.source)).toEqual(['B', 'B'])
  })

  it('answers none when every source answers nothing, and caches it', async () => {
    const [a, b] = serve([], [])

    expect(await lookupSources(ISBN)).toEqual({ kind: 'none' })
    expect(await lookupSources(ISBN)).toEqual({ kind: 'none' })
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })

  it('answers unavailable, never none, when a source fails, and does not cache it', async () => {
    const [a] = serve([], undefined)

    expect(await lookupSources(ISBN)).toEqual({ kind: 'unavailable', failed: ['B'] })
    await lookupSources(ISBN)
    expect(a).toHaveBeenCalledTimes(2)
  })

  it('lists the failed sources in source order', async () => {
    serve(undefined, 'reject', [])

    expect(await lookupSources(ISBN)).toEqual({ kind: 'unavailable', failed: ['A', 'B'] })
  })

  it('answers found from the sources that answered', async () => {
    const a1 = rec('A', 'a1')
    serve([a1], undefined)

    expect(await lookupSources(ISBN)).toEqual({
      kind: 'found',
      failed: ['B'],
      candidates: [merged([a1]).result],
      raw: merged([a1]).raw,
    })
  })

  it('counts a source that does not settle in time as failed, with a warning', async () => {
    serve([], 'hang')

    const pending = lookupSources(ISBN)
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS)

    expect(await pending).toEqual({ kind: 'unavailable', failed: ['B'] })
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[1])).toContain('timed out')
  })

  it('counts a rejecting source as failed, with a warning', async () => {
    serve([], 'reject')

    expect(await lookupSources(ISBN)).toEqual({ kind: 'unavailable', failed: ['B'] })
    expect(warn).toHaveBeenCalledOnce()
  })

  it('raises no late timeout for a source that answered in time', async () => {
    serve([], [])

    await lookupSources(ISBN)
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS)

    expect(warn).not.toHaveBeenCalled()
  })
})

describe('lookupSources circuit breaker', () => {
  // A partial `found` is cached: each lookup here starts from an empty cache,
  // so every one asks the sources.
  async function fresh() {
    processState('metadata.cache', () => new Map()).clear()
    return lookupSources(ISBN)
  }
  async function failTimes(n: number) {
    for (let i = 0; i < n; i++) await fresh()
  }

  it(`skips a source after ${BREAKER_FAILURES} failed lookups in a row, warning once`, async () => {
    const [a, b] = serve([rec('A', 'a1')], undefined)

    await failTimes(BREAKER_FAILURES)
    warn.mockClear()
    const outcome = await fresh()
    await fresh()

    expect(b).toHaveBeenCalledTimes(BREAKER_FAILURES)
    expect(a).toHaveBeenCalledTimes(BREAKER_FAILURES + 2)
    expect(outcome).toMatchObject({ kind: 'found', candidates: [{ title: 'a1' }] })
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns when the breaker opens', async () => {
    serve([], undefined)

    await failTimes(BREAKER_FAILURES)

    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[1])).toContain('paused')
  })

  it('lists a skipped source as failed', async () => {
    serve([], undefined)
    await failTimes(BREAKER_FAILURES)

    expect(await lookupSources(ISBN)).toEqual({ kind: 'unavailable', failed: ['B'] })
  })

  it('starts the count again after an answer', async () => {
    const answers: (SourceResult[] | undefined)[] = [undefined, undefined, [], undefined, undefined]
    const b = vi.fn(async () => answers.shift())
    fakes.length = 0
    fakes.push({ id: 'A', lookupByIsbn: async () => undefined }, { id: 'B', lookupByIsbn: b })

    await failTimes(5)
    await lookupSources(ISBN)

    expect(b).toHaveBeenCalledTimes(6)
  })

  it('asks the source again after the cooldown; an answer closes it', async () => {
    const answers: (SourceResult[] | undefined)[] = [undefined, undefined, undefined, []]
    const b = vi.fn(async () => answers.shift())
    fakes.length = 0
    fakes.push({ id: 'A', lookupByIsbn: async () => undefined }, { id: 'B', lookupByIsbn: b })

    await failTimes(BREAKER_FAILURES)
    vi.advanceTimersByTime(BREAKER_COOLDOWN_MS)
    await lookupSources(ISBN) // answers []
    await lookupSources(ISBN) // closed: asked again, fails once
    await lookupSources(ISBN) // one failure does not open it

    expect(b).toHaveBeenCalledTimes(BREAKER_FAILURES + 3)
  })

  it('reopens on the first failure after the cooldown', async () => {
    const [, b] = serve([], undefined)

    await failTimes(BREAKER_FAILURES)
    vi.advanceTimersByTime(BREAKER_COOLDOWN_MS)
    await lookupSources(ISBN)
    await lookupSources(ISBN)

    expect(b).toHaveBeenCalledTimes(BREAKER_FAILURES + 1)
  })
})

describe('lookupSources cache', () => {
  it.each([
    ['found', [[rec('A', 'a1')]] as Answer[], FOUND_TTL_MS],
    ['none', [[]] as Answer[], NONE_TTL_MS],
    ['partial found', [[rec('A', 'a1')], undefined] as Answer[], PARTIAL_TTL_MS],
  ])('asks again once a %s entry has expired', async (_, answers, ttl) => {
    const [a] = serve(...answers)

    await lookupSources(ISBN)
    vi.advanceTimersByTime(ttl - 1)
    await lookupSources(ISBN)
    expect(a).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(1)
    await lookupSources(ISBN)
    expect(a).toHaveBeenCalledTimes(2)
  })

  it('asks the sources with fresh even when a found outcome is cached, and caches the answer', async () => {
    serve([rec('A', 'a1')])
    await lookupSources(ISBN)

    const [again] = serve([rec('A', 'a2')])
    const outcome = await lookupSources(ISBN, { fresh: true })
    expect(again).toHaveBeenCalledOnce()
    expect(outcome).toMatchObject({ kind: 'found', candidates: [{ title: 'a2' }] })
    expect(heldOutcome(ISBN)).toEqual(outcome)
  })

  it(`keeps at most ${CACHE_SIZE} entries, evicting the least recently used`, async () => {
    const [a] = serve([])
    const isbn = (n: number) => `isbn-${n}`

    for (let n = 0; n < CACHE_SIZE; n++) await lookupSources(isbn(n))
    await lookupSources(isbn(0)) // a hit: isbn-0 becomes the newest
    await lookupSources(isbn(CACHE_SIZE)) // evicts isbn-1
    expect(a).toHaveBeenCalledTimes(CACHE_SIZE + 1)

    await lookupSources(isbn(0))
    expect(a).toHaveBeenCalledTimes(CACHE_SIZE + 1)
    await lookupSources(isbn(1))
    expect(a).toHaveBeenCalledTimes(CACHE_SIZE + 2)
  })
})

describe('heldOutcome', () => {
  it('returns undefined on a miss without asking a source', () => {
    const [a] = serve([rec('A', 'a1')])

    expect(heldOutcome(ISBN)).toBeUndefined()
    expect(a).not.toHaveBeenCalled()
  })

  it('returns a cached found outcome until it expires, without asking a source', async () => {
    const [a] = serve([rec('A', 'a1')])
    const outcome = await lookupSources(ISBN)

    expect(heldOutcome(ISBN)).toEqual(outcome)
    vi.advanceTimersByTime(FOUND_TTL_MS)
    expect(heldOutcome(ISBN)).toBeUndefined()
    expect(a).toHaveBeenCalledOnce()
  })
})
