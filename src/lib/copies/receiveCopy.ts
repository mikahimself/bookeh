import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { isRowId } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import type { Undone } from '@/lib/undo/undo'

import { locationFor, type LocationOption } from './locations'

/**
 * Spine, AD-18 and AD-20, FR-28: Received. Turns one of the context user's
 * ordered copies into an owned copy at their default location (none without
 * one), in the caller's transaction or one of its own, and resolves to where
 * it landed (`savedTo`, `null` for none) with the restore that orders it
 * again. Records nothing: callers wrap it in `withUndo()`.
 *
 * An id that is not a row id (`isRowId()`), or not the viewer's copy (a gone
 * copy, or another user's, for the admin too), fails with `NOT_FOUND` before
 * any write; the find filters on `owner` explicitly as well as through
 * `ownerAccess` (FR-48). A copy that is not ordered fails with `VALIDATION`
 * on `status`, with no write.
 *
 * The restore writes the copy back to ordered with no location (AD-8)
 * through the gateway as the restoring user, and skips a copy that is gone.
 * It names no relation target, so the AD-20 rule that a recorded target gone
 * since (a deleted or merged location) is restored as none costs it nothing;
 * `moveCopies()`' restore applies it.
 * Epic 6 makes the restore fail with `UNDO_FAILED` when the copy has gained
 * a loan since, as the save's does.
 */
export async function receiveCopy(
  ctx: Context,
  copyId: number,
): Promise<Undone<{ savedTo: LocationOption | null }>> {
  if (!isRowId(copyId)) throw new DomainError('NOT_FOUND')

  return withTransaction(ctx, async (tx) => {
    const { docs } = await gateway.find(tx, {
      collection: 'copies',
      where: { and: [{ id: { equals: copyId } }, { owner: { equals: tx.user.id } }] },
      select: { status: true },
      limit: 1,
      depth: 0,
      pagination: false,
    })
    const copy = docs[0]
    if (!copy) throw new DomainError('NOT_FOUND')
    if (copy.status !== 'ordered') {
      throw new DomainError('VALIDATION', { fields: { status: 'VALIDATION' } })
    }

    const location = await locationFor(tx, { status: 'owned' })
    await gateway.updateByID(tx, {
      collection: 'copies',
      id: copyId,
      data: { status: 'owned', location },
      depth: 0,
    })

    // Read back: the landed location's name, as the save does.
    const row = await gateway.findByID(tx, {
      collection: 'copies',
      id: copyId,
      depth: 1,
      select: { location: true },
      populate: { locations: { name: true } },
    })
    const landed = row.location
    const savedTo =
      typeof landed === 'object' && landed !== null ? { id: landed.id, name: landed.name } : null

    return { data: { savedTo }, restore: (rtx) => restoreOrdered(rtx, copyId) }
  })
}

// `count` first: a failed `updateByID` (`NotFound`) would end the transaction.
async function restoreOrdered(ctx: Context, copyId: number): Promise<void> {
  const { totalDocs } = await gateway.count(ctx, {
    collection: 'copies',
    where: { id: { equals: copyId } },
  })
  if (totalDocs === 0) return
  await gateway.updateByID(ctx, {
    collection: 'copies',
    id: copyId,
    data: { status: 'ordered', location: null },
    depth: 0,
  })
}
