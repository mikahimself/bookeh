// Spine, AD-9 and NFR-1: every source asked at once, each under its own time budget, with
// an in-process cache of settled outcomes and a circuit breaker per source.
import { logger } from '@/lib/errors'
import { processState } from '@/lib/processState'

import { mergeResults } from './merge'
import type { Source, SourceId, SourceResult, SourcesOutcome } from './source'
import { sources } from './sources'

/** One source's budget inside NFR-1's 5 s scan-to-result; the adapters' own fetch timeout is a backstop. */
export const SOURCE_TIMEOUT_MS = 4_000
/** Failed lookups in a row that open a source's breaker. */
export const BREAKER_FAILURES = 3
export const BREAKER_COOLDOWN_MS = 60_000
export const CACHE_SIZE = 500
export const FOUND_TTL_MS = 24 * 60 * 60 * 1000
// Short: a source can answer a spurious "no match" during an outage.
export const NONE_TTL_MS = 10 * 60 * 1000
// Short: a `found` merged while a source failed lacks that source's gap-fill,
// but holds long enough for the Answer's save (AD-11).
export const PARTIAL_TTL_MS = 5 * 60 * 1000

type CacheEntry = { outcome: SourcesOutcome; expiresAt: number }
type BreakerEntry = { failures: number; openUntil: number }

// Insertion order is recency: a hit moves its entry to the end, the first key is the oldest.
const cache = () => processState('metadata.cache', () => new Map<string, CacheEntry>())
// No entry means closed. After the cooldown the next lookup goes through: an answer
// deletes the entry, a failure reopens it at once (`failures` is already past the limit).
const breaker = () => processState('metadata.breaker', () => new Map<SourceId, BreakerEntry>())

function cached(isbn13: string): SourcesOutcome | undefined {
  const entries = cache()
  const entry = entries.get(isbn13)
  if (!entry) return undefined
  entries.delete(isbn13)
  if (entry.expiresAt <= Date.now()) return undefined
  entries.set(isbn13, entry)
  return entry.outcome
}

/**
 * Spine, AD-5: the server-held outcome for a normalised ISBN-13, read from the
 * in-process cache alone: `undefined` on a miss or an expired entry, and never
 * a source call; a hit refreshes the entry's recency, as a lookup's does. Only
 * `found` (a partial one included) and `none` are ever cached, so those are
 * the only kinds it returns. The save path reads it to share a private Book
 * (FR-12, D-8) without asking the sources.
 */
export function heldOutcome(isbn13: string): SourcesOutcome | undefined {
  return cached(isbn13)
}

function remember(isbn13: string, outcome: SourcesOutcome, ttl: number): void {
  const entries = cache()
  entries.delete(isbn13)
  entries.set(isbn13, { outcome, expiresAt: Date.now() + ttl })
  for (const oldest of entries.keys()) {
    if (entries.size <= CACHE_SIZE) break
    entries.delete(oldest)
  }
}

function isOpen(id: SourceId): boolean {
  return (breaker().get(id)?.openUntil ?? 0) > Date.now()
}

function track(id: SourceId, answered: boolean): void {
  const entries = breaker()
  if (answered) {
    entries.delete(id)
    return
  }
  const entry = entries.get(id) ?? { failures: 0, openUntil: 0 }
  entry.failures += 1
  // A lookup that started before the breaker opened neither extends nor re-announces it.
  if (entry.failures >= BREAKER_FAILURES && !isOpen(id)) {
    entry.openUntil = Date.now() + BREAKER_COOLDOWN_MS
    logger().warn(
      { source: id, failures: entry.failures },
      `Source ${id} paused for ${BREAKER_COOLDOWN_MS} ms after ${entry.failures} failed lookups`,
    )
  }
  entries.set(id, entry)
}

/** The source's records, or undefined when it failed, rejected or ran out of time. */
async function ask(source: Source, isbn13: string): Promise<SourceResult[] | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      logger().warn(
        { source: source.id, isbn13 },
        `Source ${source.id} timed out after ${SOURCE_TIMEOUT_MS} ms`,
      )
      resolve(undefined)
    }, SOURCE_TIMEOUT_MS)
  })
  try {
    return await Promise.race([source.lookupByIsbn(isbn13), timeout])
  } catch (err) {
    // A contract breach: sources never reject. Handled like any failure.
    logger().warn({ source: source.id, isbn13, err }, `Source ${source.id} rejected`)
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Asks every source for a normalised ISBN-13 (AD-9). `found` holds one candidate per
 * record of the first source with records, each gap-filled from the other sources in
 * source order; `none` only when every source answered with no records; otherwise
 * `unavailable`, naming the failed sources. A `found` or `none` reached with no source
 * failing is cached (`FOUND_TTL_MS`, `NONE_TTL_MS`); a `found` merged while a source
 * failed is cached for `PARTIAL_TTL_MS`, so the save after the Answer uses the outcome
 * the Answer showed (AD-11); `unavailable` never is. Never throws.
 */
export async function lookupSources(isbn13: string): Promise<SourcesOutcome> {
  const hit = cached(isbn13)
  if (hit) return hit

  const lists = await Promise.all(
    sources.map(async (source) => {
      if (isOpen(source.id)) return undefined
      const list = await ask(source, isbn13)
      track(source.id, list !== undefined)
      return list
    }),
  )
  const failed = sources.filter((_, i) => lists[i] === undefined).map(({ id }) => id)

  const first = lists.findIndex((list) => list !== undefined && list.length > 0)
  if (first === -1) {
    if (failed.length > 0) return { kind: 'unavailable', failed }
    const outcome: SourcesOutcome = { kind: 'none' }
    remember(isbn13, outcome, NONE_TTL_MS)
    return outcome
  }

  const now = new Date()
  const others = lists.flatMap((list, i) => (i === first ? [] : [list ?? []]))
  const merged = lists[first]!.map((record) => mergeResults([[record], ...others], now)!)
  const outcome: SourcesOutcome = {
    kind: 'found',
    candidates: merged.map(({ result }) => result),
    raw: merged[0].raw,
  }
  remember(isbn13, outcome, failed.length === 0 ? FOUND_TTL_MS : PARTIAL_TTL_MS)
  return outcome
}
