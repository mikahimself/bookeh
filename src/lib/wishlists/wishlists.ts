import { toNameKey } from '@/fields/nameKey'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { openEntry } from '@/lib/payload/openRows'
import { normalisedName, ownedRowKeyed, ownsRows, resolveOwnedName } from '@/lib/payload/ownedName'
import { idOf, isRowId, type Named, type Ref } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'

/** Fails with `NOT_FOUND` unless `id` is one of the context user's wishlists. */
async function assertOwnWishlist(tx: Context, id: number): Promise<void> {
  if (!(await ownsRows(tx, 'wishlists', [id]))) throw new DomainError('NOT_FOUND')
}

/**
 * Spine, AD-18 and Ref, FR-38: resolves a wishlist `Ref` to an id of the
 * context user's own list. An id that is not a row id or not one of the
 * viewer's lists (gone, or another user's, for the admin too) fails with
 * `VALIDATION` on `wishlist`, the picker's field. A name is normalised and
 * matched by `nameKey` among the viewer's lists (no accent folding, no fuzzy
 * matching), or created when none matches; blank or longer than `limits.name`
 * fails on `wishlist` before any read. Opens no transaction: it runs on the
 * caller's context, joining the action's transaction; a list created here
 * stays after Undo. A lost race between two creates of one name surfaces as
 * the unique index's `ValidationError`, unchanged.
 */
export async function resolveWishlist(ctx: Context, ref: Ref): Promise<number> {
  return resolveOwnedName(ctx, ref, { collection: 'wishlists', field: 'wishlist' })
}

/** A wishlist as the Wishlists section lists it: its name and its open entries. */
export type WishlistLine = Named & { count: number }

/**
 * Spine, AD-18, FR-39: the context user's wishlists, sorted by name in the
 * database's collation (Finnish ICU), each with its open entries (`closedAt`
 * empty) counted; closed entries never count. Both reads filter on `owner`
 * explicitly as well as through `ownerAccess`, so the admin sees only their
 * own lists (FR-48). Two reads, counted in memory.
 */
export async function listWishlists(ctx: Context): Promise<WishlistLine[]> {
  const { docs: lists } = await gateway.find(ctx, {
    collection: 'wishlists',
    where: { owner: { equals: ctx.user.id } },
    sort: 'name',
    select: { name: true },
    depth: 0,
    pagination: false,
  })
  if (lists.length === 0) return []

  const { docs: entries } = await gateway.find(ctx, {
    collection: 'wishlist-entries',
    where: { and: [{ owner: { equals: ctx.user.id } }, openEntry] },
    select: { wishlist: true },
    depth: 0,
    pagination: false,
  })
  const counts = new Map<number, number>()
  for (const { wishlist } of entries) {
    const id = idOf(wishlist)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return lists.map(({ id, name }) => ({ id, name, count: counts.get(id) ?? 0 }))
}

/** An open entry as one list shows it: its Book, and its recipient, or `null` when it is the viewer's own wish. */
export type ListEntry = { entryId: number; bookId: number; forPerson: Named | null }

/** One of the viewer's wishlists with its open entries. */
export type WishlistView = Named & { entries: ListEntry[] }

/**
 * Spine, AD-7, AD-18, FR-38: one of the context user's wishlists with its
 * open entries (`closedAt` empty), newest first, ties by id (the order comes
 * from the entries, never from a Book field). `null` when `id` is not a row
 * id (no read) or not the viewer's list: gone, or another user's, for the
 * admin too. Every read filters on `owner` explicitly as well as through
 * `ownerAccess` (FR-48). Recipient names come from one read of the distinct
 * ids; a recipient missing from it gives `forPerson: null`. Three reads at
 * most, no transaction.
 */
export async function getWishlist(ctx: Context, id: number): Promise<WishlistView | null> {
  if (!isRowId(id)) return null

  const { docs: lists } = await gateway.find(ctx, {
    collection: 'wishlists',
    where: { and: [{ id: { equals: id } }, { owner: { equals: ctx.user.id } }] },
    select: { name: true },
    limit: 1,
    pagination: false,
    depth: 0,
  })
  const list = lists[0]
  if (!list) return null

  const { docs: entries } = await gateway.find(ctx, {
    collection: 'wishlist-entries',
    where: {
      and: [{ wishlist: { equals: id } }, { owner: { equals: ctx.user.id } }, openEntry],
    },
    select: { book: true, forPerson: true },
    sort: ['-createdAt', '-id'],
    depth: 0,
    pagination: false,
  })

  const personIds = [
    ...new Set(entries.flatMap(({ forPerson }) => (forPerson == null ? [] : [idOf(forPerson)]))),
  ]
  const personById = new Map<number, Named>()
  if (personIds.length > 0) {
    const { docs: people } = await gateway.find(ctx, {
      collection: 'people',
      where: { and: [{ id: { in: personIds } }, { owner: { equals: ctx.user.id } }] },
      select: { name: true },
      depth: 0,
      pagination: false,
    })
    for (const person of people) personById.set(person.id, { id: person.id, name: person.name })
  }

  return {
    id: list.id,
    name: list.name,
    entries: entries.map((entry) => ({
      entryId: entry.id,
      bookId: idOf(entry.book),
      forPerson: entry.forPerson == null ? null : (personById.get(idOf(entry.forPerson)) ?? null),
    })),
  }
}

/**
 * Spine, AD-18, FR-38: "New list". Adds a wishlist for the context user in
 * the caller's transaction or one of its own (AD-16) and answers its id.
 * Unlike `resolveWishlist()`, a name in use is no match but a failure: blank
 * or longer than `limits.name` fails with `VALIDATION` on `name`; another of
 * the viewer's lists with the same `nameKey` fails with `NAME_TAKEN` and its
 * id as `conflictId`. Both before any write. No Undo. A lost race against a
 * concurrent create or rename surfaces as the unique index's
 * `ValidationError`, unchanged.
 */
export async function createWishlist(ctx: Context, name: string): Promise<number> {
  const normalised = normalisedName(name, 'name')

  return withTransaction(ctx, async (tx) => {
    const taken = await ownedRowKeyed(tx, 'wishlists', toNameKey(normalised))
    if (taken !== undefined) throw new DomainError('NAME_TAKEN', { conflictId: taken })

    // `owner` and `nameKey` are what Payload's create type requires; the hooks set both.
    const created = await gateway.create(tx, {
      collection: 'wishlists',
      data: { owner: tx.user.id, name: normalised, nameKey: '' },
      depth: 0,
    })
    return created.id
  })
}

/**
 * Spine, AD-18, FR-39: renames one of the context user's wishlists in the
 * caller's transaction or one of its own (AD-16). An id that is not a row id,
 * or not the viewer's list (the admin's included), fails with `NOT_FOUND`;
 * blank or longer than `limits.name` fails with `VALIDATION` on `name`;
 * another of the viewer's lists with the same `nameKey` fails with
 * `NAME_TAKEN` and its id as `conflictId`. A case-only rename keeps the
 * list's own key and succeeds. All before any write; the `nameKey` hook
 * recomputes the key. No Undo. A lost race against a concurrent create or
 * rename surfaces as the unique index's `ValidationError`, unchanged.
 */
export async function renameWishlist(ctx: Context, id: number, name: string): Promise<void> {
  if (!isRowId(id)) throw new DomainError('NOT_FOUND')
  const normalised = normalisedName(name, 'name')

  await withTransaction(ctx, async (tx) => {
    await assertOwnWishlist(tx, id)
    const taken = await ownedRowKeyed(tx, 'wishlists', toNameKey(normalised), id)
    if (taken !== undefined) throw new DomainError('NAME_TAKEN', { conflictId: taken })

    await gateway.updateByID(tx, {
      collection: 'wishlists',
      id,
      data: { name: normalised },
      depth: 0,
    })
  })
}

/** The ids of the context user's entries, open or closed, on wishlist `id`. */
async function entriesOn(tx: Context, id: number): Promise<number[]> {
  const { docs } = await gateway.find(tx, {
    collection: 'wishlist-entries',
    where: { and: [{ wishlist: { equals: id } }, { owner: { equals: tx.user.id } }] },
    select: { wishlist: true },
    depth: 0,
    pagination: false,
  })
  return docs.map((doc) => doc.id)
}

/**
 * Spine, AD-18, FR-39: deletes one of the context user's wishlists with every
 * entry on it, open or closed, in the caller's transaction or one of its own
 * (AD-16). An id that is not a row id, or not the viewer's list (the admin's
 * included), fails with `NOT_FOUND` before any write. The entries are deleted
 * through the gateway, then the list. No Undo: the screen confirms first. An
 * entry on the list committed concurrently after the entry read goes with the
 * list (`wishlist_entries.wishlist_id`, `ON DELETE cascade`, AD-19).
 */
export async function deleteWishlist(ctx: Context, id: number): Promise<void> {
  if (!isRowId(id)) throw new DomainError('NOT_FOUND')

  await withTransaction(ctx, async (tx) => {
    await assertOwnWishlist(tx, id)
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const entry of await entriesOn(tx, id)) {
      await gateway.deleteByID(tx, { collection: 'wishlist-entries', id: entry, depth: 0 })
    }
    await gateway.deleteByID(tx, { collection: 'wishlists', id, depth: 0 })
  })
}
