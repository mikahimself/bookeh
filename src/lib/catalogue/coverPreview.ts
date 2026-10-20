import type { Context } from '@/lib/payload/context'
import { processState } from '@/lib/processState'

import { coverPolicy, fetchCover, type CoverPolicy, type DownloadedCover } from './covers'
import { pickIndex } from './pick'

// Spine, AD-10, AD-12 and AD-14: the pre-save cover preview. `lookupBook`
// records every candidate's cover URL per user and ISBN-13; the
// `/data/cover/[isbn13]` handler fetches the one at the requested index
// through `fetchCover()`, the same checked call the save's cover download
// makes. The browser never asks a source, and the URL never comes from the
// client: it sends an index at most.

export const PREVIEW_SIZE = 500
export const PREVIEW_TTL_MS = 60 * 60 * 1000

/** The candidates' cover URLs in candidate order, `undefined` for one without a cover. */
type PreviewEntry = { urls: (string | undefined)[]; expiresAt: number }

// Insertion order is recency: a write moves its entry to the end, the first key is the oldest.
const previews = () =>
  processState('catalogue.coverPreviews', () => new Map<string, PreviewEntry>())

const keyOf = (ctx: Context, isbn13: string) => `${ctx.user.id}:${isbn13}`

/**
 * Records `urls`, every candidate's cover URL in candidate order, as
 * `ctx.user`'s cover previews for `isbn13`, or forgets them when none is
 * defined. Called by `lookupBook` alone. Bounded to `PREVIEW_SIZE` entries
 * (one per user and ISBN), each living `PREVIEW_TTL_MS`.
 */
export function recordCoverPreview(
  ctx: Context,
  isbn13: string,
  urls: readonly (string | undefined)[],
): void {
  const entries = previews()
  const key = keyOf(ctx, isbn13)
  entries.delete(key)
  if (urls.every((url) => url === undefined)) return
  entries.set(key, { urls: [...urls], expiresAt: Date.now() + PREVIEW_TTL_MS })
  for (const oldest of entries.keys()) {
    if (entries.size <= PREVIEW_SIZE) break
    entries.delete(oldest)
  }
}

/**
 * The cover of candidate `pick` (`pickIndex()`: out of range is the best)
 * that `ctx.user`'s last lookup of `isbn13` recorded, fetched with the cover
 * download's checks (`fetchCover()`). `undefined` with no request when the
 * user has no live record for the ISBN or that candidate has no cover. A
 * fetch failure is one logged warning and `undefined`, never an error.
 * Nothing is cached: each call fetches again.
 */
export async function fetchCoverPreview(
  ctx: Context,
  isbn13: string,
  policy: CoverPolicy = coverPolicy,
  pick = 0,
): Promise<{ bytes: Buffer; mimeType: DownloadedCover['mimeType'] } | undefined> {
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

  const fetched = await fetchCover(url, policy)
  if (!fetched.ok) {
    ctx.req.payload.logger.warn(
      { isbn13, host: fetched.host, ...('err' in fetched && { err: fetched.err }) },
      `Cover preview failed: ${fetched.reason}`,
    )
    return undefined
  }
  return { bytes: fetched.bytes, mimeType: fetched.mimeType }
}
