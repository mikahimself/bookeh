import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import type { Ref } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import type { Undone } from '@/lib/undo/undo'

import { resolveLocation } from './locations'

type Moved = { id: number; previous: number | null }

/**
 * Spine, AD-18 and AD-20, FR-33: moves a selection of the context user's
 * copies to one location (`null` for none), all or none, in the caller's
 * transaction or one of its own, and resolves to the target's id with the
 * restore that puts each copy back. Records nothing: callers wrap it in
 * `withUndo()`.
 *
 * Duplicate ids count once. An empty list, an id that is not a positive safe
 * integer, or one that is not the viewer's (a gone copy, or another user's,
 * for the admin too) fails with `NOT_FOUND` before any write; the find filters
 * on `owner` explicitly as well as through `ownerAccess` (FR-48).
 * A list holding an ordered copy fails with `VALIDATION` on `location`, a
 * move to `null` included, before the location is resolved, so no location
 * is created. A caller setting a copy to ordered does not also move it:
 * `setStatus` clears the location. A `Ref` goes through `resolveLocation()`
 * once; an id the user cannot read is refused by `copies.location`'s
 * `ownedRelation`.
 *
 * A copy already at the target is not written and not in the restore. The
 * restore closes over the moved copies' ids and previous location ids, writes
 * them back through the gateway as the restoring user, and skips a copy that
 * is gone. A location created inline stays.
 */
export async function moveCopies(
  ctx: Context,
  copyIds: readonly number[],
  location: Ref | null,
): Promise<Undone<{ location: number | null }>> {
  const ids = [...new Set(copyIds)]
  if (ids.length === 0 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
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
    // The collection rejects only a non-null location on an ordered copy.
    if (docs.some(({ status }) => status === 'ordered')) {
      throw new DomainError('VALIDATION', { fields: { location: 'VALIDATION' } })
    }

    const target = location === null ? null : await resolveLocation(tx, location)
    const moved: Moved[] = []
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const doc of docs) {
      const previous = idOf(doc.location)
      if (previous === target) continue
      await gateway.updateByID(tx, {
        collection: 'copies',
        id: doc.id,
        data: { location: target },
        depth: 0,
      })
      moved.push({ id: doc.id, previous })
    }
    return { data: { location: target }, restore: (rtx) => restoreLocations(rtx, moved) }
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
      data: { location: previous },
      depth: 0,
    })
  }
}

const idOf = (ref: number | { id: number } | null | undefined): number | null =>
  ref === null || ref === undefined ? null : typeof ref === 'number' ? ref : ref.id
