import { limits } from '@/fields/limits'
import { toNameKey } from '@/fields/nameKey'
import { normaliseName } from '@/fields/sortName'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { isRowId, type Ref } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'

/**
 * A typed name, normalised (NFC, trimmed, whitespace collapsed). Blank after
 * normalising fails with `VALIDATION` on `field`; longer than `limits.name`
 * fails with `VALIDATION` and `field` marked `TOO_LONG`, never clipped
 * (spine, Text input).
 */
function normalisedName(name: string, field: 'wishlist' | 'name'): string {
  const normalised = normaliseName(name)
  if (normalised === '') throw new DomainError('VALIDATION', { fields: { [field]: 'VALIDATION' } })
  if (normalised.length > limits.name) {
    throw new DomainError('VALIDATION', { fields: { [field]: 'TOO_LONG' } })
  }
  return normalised
}

/** The context user's wishlist keyed `key`, other than `exceptId`, or undefined. */
async function takenBy(tx: Context, key: string, exceptId?: number): Promise<number | undefined> {
  const { docs } = await gateway.find(tx, {
    collection: 'wishlists',
    where: {
      and: [
        { nameKey: { equals: key } },
        { owner: { equals: tx.user.id } },
        ...(exceptId === undefined ? [] : [{ id: { not_equals: exceptId } }]),
      ],
    },
    limit: 1,
    pagination: false,
    depth: 0,
  })
  return docs[0]?.id
}

/**
 * Whether `id` is one of the context user's wishlists. `count`, not
 * `findByID`: a `NotFound` would end the transaction. Filters on `owner`
 * explicitly as well as through `ownerAccess`, so the admin is held to their
 * own lists too (FR-48).
 */
async function ownsWishlist(tx: Context, id: number): Promise<boolean> {
  const { totalDocs } = await gateway.count(tx, {
    collection: 'wishlists',
    where: { and: [{ id: { equals: id } }, { owner: { equals: tx.user.id } }] },
  })
  return totalDocs === 1
}

/** Fails with `NOT_FOUND` unless `id` is one of the context user's wishlists. */
async function assertOwnWishlist(tx: Context, id: number): Promise<void> {
  if (!(await ownsWishlist(tx, id))) throw new DomainError('NOT_FOUND')
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
  if (typeof ref === 'number') {
    if (!isRowId(ref) || !(await ownsWishlist(ctx, ref))) {
      throw new DomainError('VALIDATION', { fields: { wishlist: 'VALIDATION' } })
    }
    return ref
  }

  const name = normalisedName(ref.create, 'wishlist')
  const found = await takenBy(ctx, toNameKey(name))
  if (found !== undefined) return found

  // `owner` and `nameKey` are what Payload's create type requires; the hooks set both.
  const created = await gateway.create(ctx, {
    collection: 'wishlists',
    data: { owner: ctx.user.id, name, nameKey: '' },
    depth: 0,
  })
  return created.id
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
    const taken = await takenBy(tx, toNameKey(normalised))
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
    const taken = await takenBy(tx, toNameKey(normalised), id)
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
 * entry on the list committed concurrently after the entry read makes the
 * list delete fail on `wishlist_entries.wishlist_id` (NOT NULL with `ON DELETE
 * set null`), and the whole call rolls back as `INTERNAL`.
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
