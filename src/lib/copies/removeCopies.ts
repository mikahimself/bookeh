import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { isRowId } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'

/** What one removal did: how many copies were deleted and the ordered ids skipped. */
export type RemoveResult = { removed: number; skipped: number[] }

/**
 * Spine, AD-18: removes the viewer's owned copies by id in the caller's
 * transaction or one of its own (AD-16). Repeated ids count once; an empty
 * list returns `{ removed: 0, skipped: [] }` before any read, and an id that
 * is not a row id (`isRowId()`) fails with `NOT_FOUND` before any read.
 * Unless every id is one of the viewer's copies, it fails with `NOT_FOUND`
 * before any delete; the read filters on `owner` explicitly as well as
 * through `ownerAccess` (FR-48). An ordered copy is skipped rather than
 * deleted (EXPERIENCE.md, Your copies: an ordered line has only Received) and
 * its id reported in `skipped`; the owned copies go. The Book stays, even
 * with no copy left. No Undo (AD-20). Epic 6 deletes the copies' loans here
 * as well.
 */
export async function removeCopies(
  ctx: Context,
  copyIds: readonly number[],
): Promise<RemoveResult> {
  const ids = [...new Set(copyIds)]
  if (ids.length === 0) return { removed: 0, skipped: [] }
  if (!ids.every(isRowId)) throw new DomainError('NOT_FOUND')
  return withTransaction(ctx, async (tx) => {
    const { docs } = await gateway.find(tx, {
      collection: 'copies',
      where: { and: [{ id: { in: ids } }, { owner: { equals: tx.user.id } }] },
      select: { status: true },
      depth: 0,
      pagination: false,
    })
    if (docs.length !== ids.length) throw new DomainError('NOT_FOUND')
    const skipped = docs.filter(({ status }) => status === 'ordered').map(({ id }) => id)
    const owned = docs.filter(({ status }) => status !== 'ordered')
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const { id } of owned) {
      await gateway.deleteByID(tx, { collection: 'copies', id, depth: 0 })
    }
    return { removed: owned.length, skipped }
  })
}
