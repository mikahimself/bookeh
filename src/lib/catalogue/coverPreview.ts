import type { Context } from '@/lib/payload/context'
import { processState } from '@/lib/processState'

import { coverPolicy, fetchCover, type CoverPolicy, type DownloadedCover } from './covers'
import { limitLookups } from './lookupLimit'
import { pickIndex } from './pick'

// Spine, AD-9, AD-10, AD-12 and AD-14: the pre-save cover preview. `lookupBook`
// (and `lookupAgain`)
// records every candidate's cover URL per user and ISBN-13; the
// `/data/cover/[isbn13]` handler serves the one at the requested index. The
// first request for an image fetches it through `fetchCover()`, the same
// checked call the save's cover download makes, and holds the bytes on the
// record, keyed by URL; later requests for that URL, at any index, are served
// from them. A record counts one lookup (`limitLookups()`) for its first
// fetch, whichever cover, and again for a cover whose fetch failed. The
// browser never asks a source, and the URL never comes from the client: it
// sends an index at most.

export const PREVIEW_SIZE = 500
export const PREVIEW_TTL_MS = 60 * 60 * 1000
/** The held covers' bytes across every record. */
export const PREVIEW_BYTES = 32 * 1024 * 1024

type HeldCover = { bytes: Buffer; mimeType: DownloadedCover['mimeType'] }

/**
 * The candidates' cover URLs in candidate order, `undefined` for one without
 * a cover, the covers fetched so far, by URL, whether the record has counted
 * its lookup, the URLs whose last fetch failed, and the fetches running, by
 * URL.
 */
type PreviewEntry = {
  urls: (string | undefined)[]
  expiresAt: number
  covers: Map<string, HeldCover>
  counted: boolean
  failed: Set<string>
  inFlight: Map<string, Promise<HeldCover | undefined>>
}

// Insertion order is recency: a write moves its entry to the end, the first key is the oldest.
const previews = () =>
  processState('catalogue.coverPreviews', () => new Map<string, PreviewEntry>())

const keyOf = (ctx: Context, isbn13: string) => `${ctx.user.id}:${isbn13}`

/**
 * Records `urls`, every candidate's cover URL in candidate order, as
 * `ctx.user`'s cover previews for `isbn13`, or forgets them when none is
 * defined. The previous record's held covers whose URL is still listed are
 * kept; the rest go. Called by `lookupBook` and `lookupAgain` alone. Bounded
 * to `PREVIEW_SIZE` entries (one per user and ISBN), each living
 * `PREVIEW_TTL_MS`.
 */
export function recordCoverPreview(
  ctx: Context,
  isbn13: string,
  urls: readonly (string | undefined)[],
): void {
  const entries = previews()
  const key = keyOf(ctx, isbn13)
  const previous = entries.get(key)
  entries.delete(key)
  if (urls.every((url) => url === undefined)) return
  const covers = new Map<string, HeldCover>()
  for (const url of urls) {
    const held = url === undefined ? undefined : previous?.covers.get(url)
    if (url !== undefined && held) covers.set(url, held)
  }
  entries.set(key, {
    urls: [...urls],
    expiresAt: Date.now() + PREVIEW_TTL_MS,
    covers,
    counted: false,
    failed: new Set(),
    inFlight: new Map(),
  })
  for (const oldest of entries.keys()) {
    if (entries.size <= PREVIEW_SIZE) break
    entries.delete(oldest)
  }
}

/**
 * The cover of candidate `pick` (`pickIndex()`: out of range is the best)
 * that `ctx.user`'s last lookup of `isbn13` recorded. `undefined` with no
 * request when the user has no live record for the ISBN or that candidate has
 * no cover. A cover the record holds is served from its bytes and counts
 * nothing, and a request for a URL already being fetched awaits that fetch.
 * Otherwise the call fetches with the cover download's checks
 * (`fetchCover()`). The record's first fetch counts one lookup
 * (`limitLookups()`, which throws `DomainError('RATE_LIMITED')` before any
 * request), marked before the fetch starts so covers loading at once count
 * once; later fetches of the record count nothing, except for a cover whose
 * last fetch failed, which counts again. A success is held on the record.
 * Past `PREVIEW_BYTES` across all records, the oldest records' held covers
 * are dropped and their count re-armed, the records kept; the record just
 * served keeps its own, so the total can pass the cap by that one record's
 * covers. A fetch failure is one logged warning and `undefined`, never an
 * error, and is not held.
 */
export async function fetchCoverPreview(
  ctx: Context,
  isbn13: string,
  policy: CoverPolicy = coverPolicy,
  pick = 0,
): Promise<HeldCover | undefined> {
  const entries = previews()
  const key = keyOf(ctx, isbn13)
  const entry = entries.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    entries.delete(key)
    return undefined
  }

  const url = entry.urls[pickIndex(pick, entry.urls.length)]
  if (url === undefined) return undefined
  const held = entry.covers.get(url)
  if (held) return held

  const running = entry.inFlight.get(url)
  if (running) return running

  if (!entry.counted || entry.failed.has(url)) {
    limitLookups(ctx)
    entry.counted = true
  }
  const request = fetchAndHold(ctx, entry, key, isbn13, url, policy)
  entry.inFlight.set(url, request)
  try {
    return await request
  } finally {
    entry.inFlight.delete(url)
  }
}

/** One fetch of `url` for `entry`, held on the live record when it succeeds. */
async function fetchAndHold(
  ctx: Context,
  entry: PreviewEntry,
  key: string,
  isbn13: string,
  url: string,
  policy: CoverPolicy,
): Promise<HeldCover | undefined> {
  const entries = previews()
  const fetched = await fetchCover(url, policy)
  if (!fetched.ok) {
    // A failing URL must not be retried uncounted: each retry is a request.
    entry.failed.add(url)
    ctx.req.payload.logger.warn(
      { isbn13, host: fetched.host, ...('err' in fetched && { err: fetched.err }) },
      `Cover preview failed: ${fetched.reason}`,
    )
    return undefined
  }
  entry.failed.delete(url)
  const cover = { bytes: fetched.bytes, mimeType: fetched.mimeType }
  // On the live record: a lookup during the fetch may have replaced it, and
  // keeps the bytes only while it still lists the URL.
  const live = entries.get(key)
  if (live?.urls.includes(url)) {
    live.covers.set(url, cover)
    keepWithinBytes(live)
  }
  return cover
}

/**
 * Drops the oldest records' held covers, never `kept`'s, until all fit
 * `PREVIEW_BYTES`; such a record counts again on its next fetch.
 */
function keepWithinBytes(kept: PreviewEntry): void {
  const entries = [...previews().values()]
  let total = 0
  for (const { covers } of entries) for (const { bytes } of covers.values()) total += bytes.length
  for (const entry of entries) {
    if (total <= PREVIEW_BYTES) return
    if (entry === kept) continue
    for (const { bytes } of entry.covers.values()) total -= bytes.length
    entry.covers.clear()
    entry.counted = false
    entry.failed.clear()
  }
}
