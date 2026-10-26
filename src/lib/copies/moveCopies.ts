import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf, isRowId, type Ref } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import type { Undone } from '@/lib/undo/undo'

import { resolveLocation } from './locations'

type Moved = { id: number; previous: number | null }

/** What one move did: the target, how many copies were written and the ordered ids skipped. */
export type MoveResult = { location: number | null; moved: number; skipped: number[] }

/**
 * Spine, AD-18 and AD-20, FR-33: moves a selection of the context user's
 * copies to one location (`null` for none) in the caller's transaction or one
 * of its own, and resolves to the target's id, how many copies were written
 * (`moved`), the ordered copies left alone (`skipped`) and the restore that
 * puts each moved copy back. Records nothing: callers wrap it in `withUndo()`.
 *
 * Duplicate ids count once. An empty list, an id that is not a row id
 * (`isRowId()`), or one that is not the viewer's (a gone copy, or another
 * user's, for the admin too) fails with `NOT_FOUND` before any write; the
 * find filters on `owner` explicitly as well as through `ownerAccess`
 * (FR-48). An ordered copy has no location (AD-8), so it is skipped rather than moved
 * and its id reported in `skipped`; the owned copies move. With no owned copy
 * nothing is written, no target is resolved or created (`location` is then
 * `null`) and the call still succeeds with `moved: 0`. A caller setting
 * a copy to ordered does not also move it: `setStatus` clears the location.
 * A `Ref` goes through `resolveLocation()` once; an id the user cannot read
 * is refused by `copies.location`'s `ownedRelation`.
 *
 * A copy already at the target is not written, not counted in `moved` and not
 * in the restore. The restore closes over the moved copies' ids and previous
 * location ids, writes them back through the gateway as the restoring user,
 * skips a copy that is gone, and restores a previous location that no longer
 * exists (deleted or merged since) as none (AD-20). A location created inline
 * stays.
 */
export async function moveCopies(
  ctx: Context,
  copyIds: readonly number[],
  location: Ref | null,
): Promise<Undone<MoveResult>> {
  const ids = [...new Set(copyIds)]
  if (ids.length === 0 || !ids.every(isRowId)) {
    throw new DomainError('NOT_FOUND')
  }

  return withTransaction(ctx, async (tx) => {
    const { docs } = await gateway.find(tx, {
      collection: 'copies',
      where: { and: [{ id: { in: ids } }, { owner: { equals: tx.user.id } }] },
      select: { status: true, location: true },
      depth: 0,
      pagination: false,
    })
    if (docs.length < ids.length) throw new DomainError('NOT_FOUND')
    const owned = docs.filter(({ status }) => status !== 'ordered')
    const skipped = docs.filter(({ status }) => status === 'ordered').map(({ id }) => id)

    // With no owned copy nothing is written, so no target is created or answered either.
    const target =
      location === null || owned.length === 0 ? null : await resolveLocation(tx, location)
    const moved: Moved[] = []
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const doc of owned) {
      const previous = idOf(doc.location) ?? null
      if (previous === target) continue
      await gateway.updateByID(tx, {
        collection: 'copies',
        id: doc.id,
        data: { location: target },
        depth: 0,
      })
      moved.push({ id: doc.id, previous })
    }
    return {
      data: { location: target, moved: moved.length, skipped },
      restore: (rtx) => restoreLocations(rtx, moved),
    }
  })
}

// `count` first: a failed `updateByID` (`NotFound`) would end the transaction.
async function restoreLocations(ctx: Context, moved: Moved[]): Promise<void> {
  for (const { id, previous } of moved) {
    const { totalDocs } = await gateway.count(ctx, {
      collection: 'copies',
      where: { id: { equals: id } },
    })
    if (totalDocs === 0) continue
    await gateway.updateByID(ctx, {
      collection: 'copies',
      id,
      data: { location: await stillThere(ctx, previous) },
      depth: 0,
    })
  }
}

/** `previous` while that location still exists; `null` once it was deleted or merged away. */
async function stillThere(ctx: Context, previous: number | null): Promise<number | null> {
  if (previous === null) return null
  const { totalDocs } = await gateway.count(ctx, {
    collection: 'locations',
    where: { id: { equals: previous } },
  })
  return totalDocs === 0 ? null : previous
}
