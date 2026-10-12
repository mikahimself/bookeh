// Spine, Structural Seed → Shared shapes (src/lib/metadata) and AD-9.

export type SourceId = string // 'finna', 'google', ...

export type SourceResult = {
  isbn13: string
  title: string
  subtitle?: string
  authors: { name: string; sortName?: string }[] // "Given Family"; "Family, Given"
  series?: string
  seriesIndex?: number
  publisher?: string
  year?: number
  language?: string
  pages?: number
  description?: string
  subjects: string[]
  themes: string[] // Finna subject terms as given
  binding?: string // "paperback", "hardcover"; display only, never stored
  coverUrl?: string
  source: SourceId // first source in order that answered
  raw: Record<SourceId, unknown>
}

export type SourcesOutcome =
  | { kind: 'found'; candidates: SourceResult[]; raw: RawMetadata } // candidates best first
  | { kind: 'none' }
  | { kind: 'unavailable'; failed: SourceId[] } // failed names the sources that failed or timed out

export type SearchHit = Pick<
  SourceResult,
  'isbn13' | 'title' | 'authors' | 'publisher' | 'year' | 'binding' | 'source'
> & { hasCover: boolean }

export type RawMetadata = {
  v: 1
  fetchedAt: string
  sources: Record<SourceId, unknown>
  subjects: Record<SourceId, string[]>
  coverUrl: string | null
}

/**
 * One metadata source (AD-9). Adding a source is one adapter file and one
 * entry in `sources/index.ts`.
 *
 * - `lookupByIsbn` resolves the source's matching records best first, `[]`
 *   when the source answered and has none, and `undefined` when it failed
 *   (logged), so an outage is never read as "no such book".
 * - Neither method ever throws or rejects: a failure is logged. The `undefined`
 *   failure signal is `lookupByIsbn`'s only; `search` still resolves a list.
 * - Each result's `isbn13` is the ISBN asked for, never another ISBN found in
 *   the record. `source` is the adapter's own `id`; `raw` is
 *   `{ [id]: completeResponse }`.
 * - A value the source does not have is left out (or `[]` for lists), never
 *   sent as a placeholder such as '', 0 or an author without a name.
 * - `binding` is for display only and is never stored.
 */
export type Source = {
  id: SourceId
  lookupByIsbn(isbn13: string): Promise<SourceResult[] | undefined>
  search?(query: string): Promise<SearchHit[]>
}
