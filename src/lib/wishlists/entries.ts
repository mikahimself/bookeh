import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import type { Ref } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import type { Undone } from '@/lib/undo/undo'

import { resolveWishlist } from './wishlists'

type Named = { id: number; name: string }

export type NewEntry = { wishlist: Ref; bookId: number }

/**
 * Spine, AD-18, FR-38: the only insert into `wishlist-entries`. Puts a Book
 * on one of the context user's wishlists as an open entry for the user
 * (no `forPerson`, no `closedAt`) and resolves to its id and the list, with
 * the restore that deletes it (AD-20). The list's `Ref` goes through
 * `resolveWishlist()` first (`VALIDATION` on `wishlist`); a Book the user
 * cannot read is refused by the collection's `readableRelation` with a
 * `ValidationError` on `book`. Resolving and the insert run in one
 * `withTransaction()`, joining the caller's, so a list created by the `Ref`
 * never outlives a failed insert.
 *
 * The restore deletes the entry through the gateway as the restoring user,
 * open or closed by then, and does nothing when it is already gone. A list
 * created by the `Ref` stays. It closes over the entry's id only.
 */
export async function createEntry(
  ctx: Context,
  input: NewEntry,
): Promise<Undone<{ entryId: number; wishlist: Named }>> {
  return withTransaction(ctx, async (tx) => {
    const wishlistId = await resolveWishlist(tx, input.wishlist)
    const { docs } = await gateway.find(tx, {
      collection: 'wishlists',
      where: { and: [{ id: { equals: wishlistId } }, { owner: { equals: tx.user.id } }] },
      select: { name: true },
      limit: 1,
      pagination: false,
      depth: 0,
    })
    const list = docs[0]
    if (!list) throw new Error(`Wishlist ${wishlistId} vanished inside the transaction`)
    // `owner` is what Payload's create type requires; the hook sets it from the request.
    const entry = await gateway.create(tx, {
      collection: 'wishlist-entries',
      data: { owner: tx.user.id, wishlist: wishlistId, book: input.bookId },
      depth: 0,
    })
    const id = entry.id
    return {
      data: { entryId: id, wishlist: { id: wishlistId, name: list.name } },
      restore: (rtx) => deleteEntry(rtx, id),
    }
  })
}

// `count` first: a failed `deleteByID` (`NotFound`) would end the transaction.
async function deleteEntry(ctx: Context, id: number): Promise<void> {
  const { totalDocs } = await gateway.count(ctx, {
    collection: 'wishlist-entries',
    where: { id: { equals: id } },
  })
  if (totalDocs === 0) return
  await gateway.deleteByID(ctx, { collection: 'wishlist-entries', id, depth: 0 })
}
