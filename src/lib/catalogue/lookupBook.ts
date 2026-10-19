import { normaliseIsbn } from '@/fields/isbn'
import { getEffectiveBooks, type EffectiveBook } from '@/lib/books/effectiveBook'
import { getHoldings, type Holdings } from '@/lib/books/holdings'
import { lookupSources } from '@/lib/metadata/lookup'
import type { SourceId, SourceResult } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'

import { findByName, type NamedCollection } from './findOrCreateByName'
import { limitLookups } from './lookupLimit'

// Spine, Structural Seed (Shared shapes, `src/lib/catalogue`) and AD-9.

/**
 * A source candidate as the Answer shows it (AD-9): the `SourceResult` without
 * its `raw` (never leaves the server) and without `coverUrl`, which the
 * pre-save cover preview streams from the server's own record instead.
 */
export type Draft = Omit<SourceResult, 'raw' | 'coverUrl'> & { hasCover: boolean }

/**
 * The ISBN as entered (ISBN-10 or -13, hyphens and spaces allowed) and the
 * chosen candidate. The spine's `{ bookId }` target arrives with I12.
 */
export type LookupTarget = { isbn: string; pick?: number }

/**
 * A name of the picked candidate and the shared row a save would link it to;
 * `id: null` means the save would create it, which the Answer marks "New
 * author" or "New series" (FR-13).
 */
export type Match = { name: string; id: number | null }

/**
 * What an ISBN is (AD-9, FR-11): a Book the viewer can already read, with
 * what they hold of it; the sources' candidates with the picked index and the
 * picked one's author and series matches; no source knows it; or the sources
 * could not be asked. `rawMetadata` and `raw` never appear in any kind. The
 * spine's `genres` in `matches` arrives with `mapSubjectsToGenres` (Epic 9).
 */
export type LookupResult =
  | { kind: 'existing'; book: EffectiveBook; mine: Holdings }
  | {
      kind: 'source'
      candidates: Draft[]
      pick: number
      matches: { authors: Match[]; series: Match | null }
    }
  | { kind: 'none' }
  | { kind: 'unavailable'; failed: SourceId[] }

const toDraft = ({ raw: _raw, coverUrl, ...rest }: SourceResult): Draft => ({
  ...rest,
  hasCover: coverUrl !== undefined,
})

/** `pick` when it indexes a candidate; otherwise the best one (AD-9). */
const pickIndex = (pick: number | undefined, length: number): number =>
  pick !== undefined && Number.isInteger(pick) && pick >= 0 && pick < length ? pick : 0

/**
 * AD-5, AD-9 and FR-13: the shared row a save of `name` would link to. A
 * `source` answer exists only when the viewer reads no Book with the ISBN, so
 * its save creates a shared Book, whose authors and series match among
 * shared rows only: the viewer's own private rows and anyone else's do not
 * count.
 */
const sharedMatch = async (
  ctx: Context,
  collection: NamedCollection,
  name: string,
): Promise<Match> => ({ name, id: (await findByName(ctx, collection, 'shared', name))?.id ?? null })

/**
 * Spine, AD-9 and FR-11: the Answer's one data call. Normalises the ISBN
 * (`INVALID_ISBN` before any read), then answers in order: a shared Book with
 * that ISBN, the viewer's own private Book, then `lookupSources`. Lookup is
 * read-only: nothing is created here, a Book only on save.
 *
 * The read scopes the Book explicitly to shared or the viewer's own private
 * row: the admin's read access reaches every private Book (AD-4), and this
 * answer is never someone else's. A shared row wins over the viewer's private
 * one when both exist (AD-5's auto-share has not run yet). When the answer is
 * the viewer's private Book, the sources are asked as well and the outcome
 * discarded: it warms the in-process cache so the next save can auto-share
 * (AD-5). A shared Book never calls the sources.
 * Rate-limited per user after normalising (`limitLookups`, AD-9): a refused call reads nothing.
 */
export async function lookupBook(ctx: Context, target: LookupTarget): Promise<LookupResult> {
  const isbn13 = normaliseIsbn(target.isbn)
  limitLookups(ctx)

  // At most one shared and one own private row (`isbnIndexes`, AD-19).
  const { docs } = await gateway.find(ctx, {
    collection: 'books',
    where: {
      and: [
        { isbn13: { equals: isbn13 } },
        { or: [{ visibility: { equals: 'shared' } }, { createdBy: { equals: ctx.user.id } }] },
      ],
    },
    select: { visibility: true },
    depth: 0,
    limit: 2,
    pagination: false,
  })

  const existing = docs.find((book) => book.visibility === 'shared') ?? docs[0]
  if (existing) {
    if (existing.visibility === 'private') await lookupSources(isbn13)
    // One after the other: calls on one context never run concurrently (AD-16).
    const books = await getEffectiveBooks(ctx, [existing.id])
    const holdings = await getHoldings(ctx, [existing.id])
    // Both present: the row was just read through the same access scope
    // `getEffectiveBooks` applies, and `getHoldings` keys every requested id.
    return { kind: 'existing', book: books.get(existing.id)!, mine: holdings.get(existing.id)! }
  }

  const outcome = await lookupSources(isbn13)
  switch (outcome.kind) {
    case 'none':
      return { kind: 'none' }
    case 'unavailable':
      return { kind: 'unavailable', failed: outcome.failed }
    case 'found': {
      const pick = pickIndex(target.pick, outcome.candidates.length)
      // `found` always carries a candidate, and `pickIndex` stays in range.
      const best = outcome.candidates[pick]!
      // One after the other: calls on one context never run concurrently (AD-16).
      const authors: Match[] = []
      for (const { name } of best.authors) authors.push(await sharedMatch(ctx, 'authors', name))
      const series =
        best.series === undefined ? null : await sharedMatch(ctx, 'series', best.series)
      return {
        kind: 'source',
        candidates: outcome.candidates.map(toDraft),
        pick,
        matches: { authors, series },
      }
    }
  }
}
