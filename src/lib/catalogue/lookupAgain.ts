import { requireOwnBook } from '@/lib/books/requireOwnBook'
import { DomainError } from '@/lib/errors'
import { heldOutcome, lookupSources } from '@/lib/metadata/lookup'
import type { SourceId } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { withTransaction } from '@/lib/payload/transaction'

import { clipCandidate } from './clipCandidate'
import { recordCoverPreview } from './coverPreview'
import { findBookByIsbn } from './findBookByIsbn'
import { type Draft, toDraft } from './lookupBook'
import { limitLookups } from './lookupLimit'
import type { CandidateId } from './pick'
import { type PendingShare, prepareShare, settleHeldBook } from './sharePrivateBook'

/**
 * `shared`: the Book the viewer's private Book became (the same id after a
 * promote, the shared Book's after a merge) and its source (the candidate's,
 * or the shared Book's, `null` when it has none); `editions`: the candidates
 * to pick from, nothing written; `none`: no source has the ISBN;
 * `unavailable`: the sources that failed while none had it.
 */
export type LookupAgainResult =
  | { kind: 'shared'; bookId: number; source: string | null }
  | { kind: 'editions'; candidates: Draft[]; pick: number }
  | { kind: 'none' }
  | { kind: 'unavailable'; failed: SourceId[] }

/**
 * Spine, AD-5, FR-12 and D-8: Look it up again on the creator's own private
 * Book. The gate is `refetchBook()`'s shape: `requireOwnBook()`, then a
 * gateway read; anything but the viewer's own private Book with an ISBN is
 * `NOT_FOUND` before any source is asked. Then `limitLookups()`
 * (`RATE_LIMITED`).
 *
 * When a shared Book with the ISBN exists (`findBookByIsbn()`), the private
 * Book merges into it without asking the sources. Otherwise the sources are
 * asked fresh (`lookupSources(isbn13, { fresh: true })`): the cache may hold
 * the `none` of the scan that led here. With `candidate` (the second call of
 * the edition round trip) a held `found` outcome is used instead, and a fresh
 * lookup only when none is held, so the Book takes the edition shown.
 * Without `candidate`, two or more candidates come back as `editions` with
 * their cover previews recorded (`recordCoverPreview()`), nothing written.
 *
 * The share is `prepareShare()` then `settleHeldBook()` in one
 * `withTransaction()`: overrides, re-matching, the cover rules and orphan
 * clean-up are theirs, and a candidate the outcome lacks is `NOT_FOUND`. No
 * copy is created and nothing is undoable. Another user's private Book, row
 * or copy is never read or changed.
 */
export async function lookupAgain(
  ctx: Context,
  { bookId, candidate }: { bookId: number; candidate?: CandidateId },
): Promise<LookupAgainResult> {
  await requireOwnBook(ctx, bookId)
  // Scoped to the viewer's own rows: the admin's read access reaches every private Book.
  const { docs } = await gateway.find(ctx, {
    collection: 'books',
    where: {
      and: [
        { id: { equals: bookId } },
        { visibility: { equals: 'private' } },
        { createdBy: { equals: ctx.user.id } },
      ],
    },
    select: { isbn13: true },
    limit: 1,
    pagination: false,
    depth: 0,
  })
  const isbn13 = docs[0]?.isbn13
  if (!isbn13) throw new DomainError('NOT_FOUND')

  limitLookups(ctx)
  const held = await findBookByIsbn(ctx, isbn13)
  if (!held) throw new DomainError('NOT_FOUND')
  if (held.visibility === 'shared') return share(ctx, isbn13, bookId, undefined)

  const kept = candidate ? heldOutcome(isbn13) : undefined
  const outcome = kept?.kind === 'found' ? kept : await lookupSources(isbn13, { fresh: true })
  if (outcome.kind === 'none') return { kind: 'none' }
  if (outcome.kind === 'unavailable') return { kind: 'unavailable', failed: outcome.failed }

  if (!candidate && outcome.candidates.length > 1) {
    // As `lookupBook()`: the values a save stores, and every candidate's cover for the picker.
    const candidates = outcome.candidates.map(clipCandidate)
    recordCoverPreview(
      ctx,
      isbn13,
      candidates.map(({ coverUrl }) => coverUrl),
    )
    return { kind: 'editions', candidates: candidates.map(toDraft), pick: 0 }
  }

  const pending = await prepareShare(ctx, isbn13, held, outcome, undefined, candidate)
  return share(ctx, isbn13, bookId, pending)
}

/** The share's transaction; the source is the candidate's on a promote, the shared Book's on a merge. */
async function share(
  ctx: Context,
  isbn13: string,
  bookId: number,
  pending: PendingShare | undefined,
): Promise<LookupAgainResult> {
  return withTransaction(ctx, async (tx) => {
    const id = await settleHeldBook(tx, isbn13, pending)
    // A shared Book created since the read is merged into, and `pending` ignored.
    if (id === bookId && pending) {
      return { kind: 'shared', bookId: id, source: pending.candidate.source }
    }
    const { docs } = await gateway.find(tx, {
      collection: 'books',
      where: { id: { equals: id } },
      select: { source: true },
      limit: 1,
      pagination: false,
      depth: 0,
    })
    return { kind: 'shared', bookId: id, source: docs[0]?.source ?? null }
  })
}
