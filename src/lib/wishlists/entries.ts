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

/**
 * Spine, AD-18 and FR-28: Add to library ticks off the user's own wishes.
 * Closes the context user's open entries for the Book that have no recipient
 * (`forPerson` empty), all with one `closedAt`, in one `withTransaction()`
 * joining the caller's, and resolves to the ids closed with the restore that
 * reopens them (AD-20). Entries for a Person, closed entries and other
 * users' entries are left alone: the find filters on `owner` explicitly as
 * well as through `ownerAccess`, so the admin is held to their own.
 *
 * The restore clears `closedAt` on each closed entry still present, as the
 * restoring user; one deleted since is skipped. It closes over the ids only.
 */
export async function closeEntriesForBook(ctx: Context, bookId: number): Promise<Undone<number[]>> {
  return withTransaction(ctx, async (tx) => {
    const { docs } = await gateway.find(tx, {
      collection: 'wishlist-entries',
      where: {
        and: [
          { owner: { equals: tx.user.id } },
          { book: { equals: bookId } },
          { forPerson: { exists: false } },
          { closedAt: { exists: false } },
        ],
      },
      select: { book: true },
      depth: 0,
      pagination: false,
    })
    const ids = docs.map((doc) => doc.id)
    const closedAt = new Date().toISOString()
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const id of ids) {
      await gateway.updateByID(tx, {
        collection: 'wishlist-entries',
        id,
        data: { closedAt },
        depth: 0,
      })
    }
    return { data: ids, restore: (rtx) => reopenEntries(rtx, ids) }
  })
}

async function reopenEntries(ctx: Context, ids: number[]): Promise<void> {
  if (ids.length === 0) return
  // A find first: a failed `updateByID` (`NotFound`) would end the transaction.
  const { docs } = await gateway.find(ctx, {
    collection: 'wishlist-entries',
    where: { id: { in: ids } },
    select: { book: true },
    depth: 0,
    pagination: false,
  })
  for (const { id } of docs) {
    await gateway.updateByID(ctx, {
      collection: 'wishlist-entries',
      id,
      data: { closedAt: null },
      depth: 0,
    })
  }
}

/**
 * Spine, AD-5 and AD-18: moves the context user's entries for one Book,
 * open or closed, to another, in the caller's transaction or one of its own
 * (AD-16), and resolves to the number moved. Used when a private Book merges
 * into the shared Book with its ISBN (FR-12, D-8). `wishlist`, `forPerson`
 * and `closedAt` stay. As `moveCopiesToBook()`, the find filters on `owner`
 * explicitly, so no other user's entry is read or changed; a target the user
 * cannot read is refused by `readableRelation` with a `ValidationError` on
 * `book`.
 */
export async function moveEntriesToBook(
  ctx: Context,
  fromBookId: number,
  toBookId: number,
): Promise<number> {
  return withTransaction(ctx, async (tx) => {
    const { docs } = await gateway.find(tx, {
      collection: 'wishlist-entries',
      where: { and: [{ owner: { equals: tx.user.id } }, { book: { equals: fromBookId } }] },
      select: { book: true },
      depth: 0,
      pagination: false,
    })
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const { id } of docs) {
      await gateway.updateByID(tx, {
        collection: 'wishlist-entries',
        id,
        data: { book: toBookId },
        depth: 0,
      })
    }
    return docs.length
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
