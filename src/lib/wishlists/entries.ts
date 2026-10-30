import { createCopy } from '@/lib/copies/createCopy'
import type { LocationOption } from '@/lib/copies/locations'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf, isRowId, type Ref } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import { resolvePerson } from '@/lib/people/people'
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

/**
 * What Bought or Ordered made: the copy (`null` for a Person's entry) and
 * where a bought own copy landed.
 */
export type ClosedEntry = { copyId: number | null; savedTo: LocationOption | null }

/**
 * Spine, AD-18 and AD-20, FR-28: Bought and Ordered on one of the context
 * user's open entries. An entry for a Person (`forPerson` set) is closed
 * alone and makes no copy: a gift never lands on the user's shelf. An entry
 * with no recipient closes as a save does: `closeEntriesForBook()` closes
 * every one of the user's own open entries for its Book, on any list, then
 * `createCopy()` makes one copy, owned at the default location (none without
 * one) for bought, ordered for ordered. All in one `withTransaction()`
 * joining the caller's, so a failed copy rolls the close back and the
 * entries stay open. A Book the user can no longer read is refused by
 * `createCopy()` (`readableRelation`, a `ValidationError` on `book`), and the
 * close rolls back with it. Resolves to the copy and, for a bought own copy,
 * where it landed. Entries for a Person and `user-books` are left alone.
 * Records nothing: callers wrap it in `withUndo()`.
 *
 * An id that is not a row id (`isRowId()`), or not one of the user's open
 * entries (gone, closed, or another user's, for the admin too), fails with
 * `NOT_FOUND` before any write; the find filters on `owner` explicitly as
 * well as through `ownerAccess` (FR-48).
 *
 * The restore runs the copy's restore first, which refuses with
 * `UNDO_FAILED` once the copy has any loan, then clears `closedAt` on every
 * entry the close closed that is still present. It closes over ids only.
 */
export async function closeEntry(
  ctx: Context,
  entryId: number,
  as: 'bought' | 'ordered',
): Promise<Undone<ClosedEntry>> {
  if (!isRowId(entryId)) throw new DomainError('NOT_FOUND')

  return withTransaction(ctx, async (tx) => {
    const { docs } = await gateway.find(tx, {
      collection: 'wishlist-entries',
      where: {
        and: [
          { id: { equals: entryId } },
          { owner: { equals: tx.user.id } },
          { closedAt: { exists: false } },
        ],
      },
      select: { forPerson: true, book: true },
      limit: 1,
      depth: 0,
      pagination: false,
    })
    const entry = docs[0]
    if (!entry) throw new DomainError('NOT_FOUND')

    if (entry.forPerson != null) {
      await gateway.updateByID(tx, {
        collection: 'wishlist-entries',
        id: entryId,
        data: { closedAt: new Date().toISOString() },
        depth: 0,
      })
      return {
        data: { copyId: null, savedTo: null },
        restore: (rtx) => reopenEntries(rtx, [entryId]),
      }
    }

    const bookId = idOf(entry.book)
    // FR-28, decision 1: as a save, every own wish for the Book, this one included.
    const closed = await closeEntriesForBook(tx, bookId)
    const copy = await createCopy(
      tx,
      as === 'bought' ? { bookId, status: 'owned' } : { bookId, status: 'ordered' },
    )
    const copyId = copy.data
    let savedTo: LocationOption | null = null
    if (as === 'bought') {
      // Read back: the landed location's name, as the save does.
      const row = await gateway.findByID(tx, {
        collection: 'copies',
        id: copyId,
        depth: 1,
        select: { location: true },
        populate: { locations: { name: true } },
      })
      const landed = row.location
      savedTo =
        typeof landed === 'object' && landed !== null ? { id: landed.id, name: landed.name } : null
    }
    return {
      data: { copyId, savedTo },
      restore: async (rtx) => {
        await copy.restore(rtx)
        await closed.restore(rtx)
      },
    }
  })
}

/**
 * The context user's open entry `entryId` (explicit `owner` filter as well as
 * `ownerAccess`, FR-48), or `NOT_FOUND`: gone, closed, or another user's, for
 * the admin too. Runs on the caller's transaction.
 */
async function assertOpenEntry(tx: Context, entryId: number): Promise<void> {
  const { totalDocs } = await gateway.count(tx, {
    collection: 'wishlist-entries',
    where: {
      and: [
        { id: { equals: entryId } },
        { owner: { equals: tx.user.id } },
        { closedAt: { exists: false } },
      ],
    },
  })
  if (totalDocs === 0) throw new DomainError('NOT_FOUND')
}

/**
 * Spine, AD-18, FR-38: the opened entry's "For". Sets, changes or clears the
 * recipient (`forPerson`) of one of the context user's open entries and
 * resolves to the recipient's Person id, `null` once cleared. A `Ref` goes
 * through `resolvePerson()` (`lib/people`, `VALIDATION` on `person`), so an
 * inline name matching one of the user's People by `nameKey` reuses it and a
 * new name creates one. The entry is checked first, so a `NOT_FOUND` never
 * creates a Person. All in one `withTransaction()` joining the caller's.
 * Nothing else on the entry changes. No Undo: the combobox saves at once.
 *
 * An id that is not a row id (`isRowId()`), or not one of the user's open
 * entries (gone, closed, or another user's, for the admin too), fails with
 * `NOT_FOUND` before any write.
 */
export async function setEntryRecipient(
  ctx: Context,
  entryId: number,
  person: Ref | null,
): Promise<number | null> {
  if (!isRowId(entryId)) throw new DomainError('NOT_FOUND')

  return withTransaction(ctx, async (tx) => {
    await assertOpenEntry(tx, entryId)
    const personId = person === null ? null : await resolvePerson(tx, person)
    await gateway.updateByID(tx, {
      collection: 'wishlist-entries',
      id: entryId,
      data: { forPerson: personId },
      depth: 0,
    })
    return personId
  })
}

/**
 * Spine, AD-18, FR-38: Remove on the opened entry. Deletes one of the context
 * user's open entries in one `withTransaction()` joining the caller's;
 * `user-books` and the list are left alone. The Book stays, even with no
 * copy or entry left (as `removeCopies()`). No Undo and no restore: the
 * screen confirms Remove with a dialog.
 *
 * An id that is not a row id (`isRowId()`), or not one of the user's open
 * entries (gone, closed, or another user's, for the admin too), fails with
 * `NOT_FOUND` before any write.
 */
export async function removeEntry(ctx: Context, entryId: number): Promise<void> {
  if (!isRowId(entryId)) throw new DomainError('NOT_FOUND')

  await withTransaction(ctx, async (tx) => {
    await assertOpenEntry(tx, entryId)
    await gateway.deleteByID(tx, { collection: 'wishlist-entries', id: entryId, depth: 0 })
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
