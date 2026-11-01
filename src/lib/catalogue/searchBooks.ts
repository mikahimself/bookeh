import { searchSources } from '@/lib/metadata/lookup'
import type { SearchHit } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'

import { recordCoverPreview } from './coverPreview'
import { limitLookups } from './lookupLimit'

// Spine, Structural Seed (Shared shapes, `src/lib/catalogue`), AD-9 and AD-14.

/**
 * A search hit as a result row shows it (AD-9): the `SearchHit` without its
 * `coverUrl`, which stays on the server, and `hasCover` in its place —
 * `Draft`'s split, for the narrow search shape.
 */
export type SearchDraft = Omit<SearchHit, 'coverUrl'> & { hasCover: boolean }

/** A hit as a result row shows it: no `coverUrl`, `hasCover` for it. */
export const toSearchDraft = ({ coverUrl, ...rest }: SearchHit): SearchDraft => ({
  ...rest,
  hasCover: coverUrl !== undefined,
})

/**
 * Spine, AD-9: the only caller of the sources' `search()`. Blank or
 * whitespace-only text answers `[]` with no source asked and nothing counted.
 * Otherwise the call counts one lookup for the user (`limitLookups`, which
 * throws `DomainError('RATE_LIMITED')` before any source is asked, however
 * many sources answer), then merges every source's hits in source order
 * (`searchSources`). Each hit that carries a cover URL is recorded as that
 * user's cover preview for its ISBN-13, so `/data/cover/[isbn13]` can serve it
 * (AD-14); a hit without one records nothing. Writes nothing to the database.
 */
export async function searchBooks(ctx: Context, text: string): Promise<SearchDraft[]> {
  const query = text.trim()
  if (!query) return []
  limitLookups(ctx)

  const hits = await searchSources(query)
  for (const { isbn13, coverUrl } of hits) {
    if (coverUrl !== undefined) recordCoverPreview(ctx, isbn13, [coverUrl])
  }
  return hits.map(toSearchDraft)
}
