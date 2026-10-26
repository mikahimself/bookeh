import { toNameKey } from '@/fields/nameKey'
import { normaliseName } from '@/fields/sortName'
import { getProfile, updateProfile } from '@/lib/account/profile'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf, isRowId, type Ref } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'

/**
 * Spine, AD-18 and Ref: resolves a location `Ref` to an id of the context
 * user's own location. An id is returned unchecked; `copies.location`'s
 * `ownedRelation` rejects one the user cannot read. A name is normalised
 * (NFC, trimmed, whitespace collapsed) and matched by `nameKey` among the
 * user's locations (no accent folding, no fuzzy matching), or created when
 * none matches. A name blank after normalising fails with `VALIDATION` on
 * `location` before any read. Runs in the caller's transaction when the
 * context carries one; a location created here stays after Undo. A lost race
 * between two creates of one name surfaces as the unique index's
 * `ValidationError`, unchanged.
 */
export async function resolveLocation(ctx: Context, ref: Ref): Promise<number> {
  if (typeof ref === 'number') return ref

  const name = normaliseName(ref.create)
  if (name === '') throw new DomainError('VALIDATION', { fields: { location: 'VALIDATION' } })

  // Owner access scopes the read to the context user, the admin included.
  const { docs } = await gateway.find(ctx, {
    collection: 'locations',
    where: { nameKey: { equals: toNameKey(name) } },
    limit: 1,
    pagination: false,
    depth: 0,
  })
  const found = docs[0]
  if (found) return found.id

  // `owner` and `nameKey` are what Payload's create type requires; the hooks set both.
  const created = await gateway.create(ctx, {
    collection: 'locations',
    data: { owner: ctx.user.id, name, nameKey: '' },
    depth: 0,
  })
  return created.id
}

/** A copy's status and, when owned, where it is. An ordered copy has no location (AD-8). */
export type CopyStatus = { status: 'owned'; location?: Ref | null } | { status: 'ordered' }

/**
 * Spine, AD-8 and AD-18: the location a copy gets with a status, shared by
 * `createCopy()` and `setStatus()`. Ordered: none. Owned: `null` means none,
 * a `Ref` goes through `resolveLocation()`, and undefined means the context
 * user's `defaultLocation`, or none without one (FR-4, FR-31).
 */
export async function locationFor(ctx: Context, change: CopyStatus): Promise<number | null> {
  if (change.status === 'ordered') return null
  if (change.location === null) return null
  if (change.location !== undefined) return resolveLocation(ctx, change.location)
  const fallback = ctx.user.defaultLocation
  return idOf(fallback) ?? null
}

/** A location as a picker lists it. */
export type LocationOption = { id: number; name: string }

/**
 * Spine, AD-18: the context user's own locations, sorted by name in the
 * database's collation (Finnish ICU). Owner access scopes the read, the
 * admin included.
 */
export async function listLocations(ctx: Context): Promise<LocationOption[]> {
  const { docs } = await gateway.find(ctx, {
    collection: 'locations',
    sort: 'name',
    pagination: false,
    depth: 0,
    select: { name: true },
  })
  return docs.map(({ id, name }) => ({ id, name }))
}

/**
 * Spine, AD-18, FR-31: adds a location for the context user in the caller's
 * transaction or one of its own (AD-16), and answers its id. Unlike
 * `resolveLocation()`, a name in use is no match but a failure: a name blank
 * after normalising fails with `VALIDATION` on `name`; another of the
 * viewer's locations with the same `nameKey` fails with `NAME_TAKEN` and its
 * id as `conflictId`. Both before any write. A lost race against a concurrent
 * create or rename surfaces as the unique index's `ValidationError`, unchanged.
 */
export async function createLocation(ctx: Context, name: string): Promise<number> {
  const normalised = normaliseName(name)
  if (normalised === '') throw new DomainError('VALIDATION', { fields: { name: 'VALIDATION' } })

  return withTransaction(ctx, async (tx) => {
    const { docs } = await gateway.find(tx, {
      collection: 'locations',
      where: {
        and: [{ nameKey: { equals: toNameKey(normalised) } }, { owner: { equals: tx.user.id } }],
      },
      limit: 1,
      pagination: false,
      depth: 0,
    })
    const taken = docs[0]
    if (taken) throw new DomainError('NAME_TAKEN', { conflictId: taken.id })

    // `owner` and `nameKey` are what Payload's create type requires; the hooks set both.
    const created = await gateway.create(tx, {
      collection: 'locations',
      data: { owner: tx.user.id, name: normalised, nameKey: '' },
      depth: 0,
    })
    return created.id
  })
}

/**
 * Fails with `NOT_FOUND` unless every id (distinct) is one of the context
 * user's locations. `count`, not `findByID`: a `NotFound` would end the
 * transaction. Filters on `owner` explicitly as well as through `ownerAccess`,
 * so the admin is held to their own locations too (FR-48).
 */
async function assertOwnLocations(tx: Context, ids: number[]): Promise<void> {
  const { totalDocs } = await gateway.count(tx, {
    collection: 'locations',
    where: { and: [{ id: { in: ids } }, { owner: { equals: tx.user.id } }] },
  })
  if (totalDocs !== ids.length) throw new DomainError('NOT_FOUND')
}

/**
 * Moves the context user's copies at `from`, and their default location when
 * it is `from` as read here, to `to` (`null` clears them). Explicit writes: the
 * `ON DELETE set null` foreign keys catch only a reference committed
 * concurrently. The profile goes through `lib/account`.
 */
async function repointLocation(tx: Context, from: number, to: number | null): Promise<void> {
  const { docs } = await gateway.find(tx, {
    collection: 'copies',
    where: { and: [{ location: { equals: from } }, { owner: { equals: tx.user.id } }] },
    select: { location: true },
    depth: 0,
    pagination: false,
  })
  // One after the other: calls on one context never run concurrently (AD-16).
  for (const doc of docs) {
    await gateway.updateByID(tx, {
      collection: 'copies',
      id: doc.id,
      data: { location: to },
      depth: 0,
    })
  }

  if ((await getProfile(tx)).defaultLocation === from) {
    await updateProfile(tx, { defaultLocation: to })
  }
}

/**
 * Spine, AD-18, FR-31: deletes one of the context user's locations in the
 * caller's transaction or one of its own (AD-16). An id that is not a positive
 * safe integer, or not the viewer's location (gone, or another user's, for the
 * admin too), fails with `NOT_FOUND` before any write. The viewer's copies
 * there and their default location are cleared, then the location is deleted.
 * No Undo.
 */
export async function deleteLocation(ctx: Context, id: number): Promise<void> {
  if (!isRowId(id)) throw new DomainError('NOT_FOUND')

  await withTransaction(ctx, async (tx) => {
    await assertOwnLocations(tx, [id])
    await repointLocation(tx, id, null)
    await gateway.deleteByID(tx, { collection: 'locations', id, depth: 0 })
  })
}

/**
 * Spine, AD-18, FR-31: renames one of the context user's locations in the
 * caller's transaction or one of its own (AD-16). An id that is not a positive
 * safe integer, or not the viewer's location (the admin's included), fails
 * with `NOT_FOUND`; a name blank after normalising fails with `VALIDATION` on
 * `name`; another of the viewer's locations with the same `nameKey` fails with
 * `NAME_TAKEN` and its id as `conflictId`, so the caller can offer a merge.
 * A case-only rename keeps the location's own key and succeeds. All before any
 * write; the `nameKey` hook recomputes the key. A lost race against a
 * concurrent create or rename surfaces as the unique index's
 * `ValidationError`, unchanged. No Undo.
 */
export async function renameLocation(ctx: Context, id: number, name: string): Promise<void> {
  if (!isRowId(id)) throw new DomainError('NOT_FOUND')
  const normalised = normaliseName(name)
  if (normalised === '') throw new DomainError('VALIDATION', { fields: { name: 'VALIDATION' } })

  await withTransaction(ctx, async (tx) => {
    await assertOwnLocations(tx, [id])

    const { docs } = await gateway.find(tx, {
      collection: 'locations',
      where: {
        and: [
          { nameKey: { equals: toNameKey(normalised) } },
          { owner: { equals: tx.user.id } },
          { id: { not_equals: id } },
        ],
      },
      limit: 1,
      pagination: false,
      depth: 0,
    })
    const taken = docs[0]
    if (taken) throw new DomainError('NAME_TAKEN', { conflictId: taken.id })

    await gateway.updateByID(tx, {
      collection: 'locations',
      id,
      data: { name: normalised },
      depth: 0,
    })
  })
}

/**
 * Spine, AD-18, FR-31: merges one of the context user's locations into
 * another in the caller's transaction or one of its own (AD-16). Either id
 * not a row id (`isRowId()`), or not the viewer's location (the admin's
 * included), fails with `NOT_FOUND`; merging a location into itself fails with
 * `VALIDATION`; both before any write. The viewer's copies at the source and
 * their default location, when it is the source, move to the target, then the
 * source is deleted. No Undo.
 */
export async function mergeLocation(
  ctx: Context,
  sourceId: number,
  targetId: number,
): Promise<void> {
  if (!isRowId(sourceId) || !isRowId(targetId)) throw new DomainError('NOT_FOUND')
  if (sourceId === targetId) throw new DomainError('VALIDATION')

  await withTransaction(ctx, async (tx) => {
    await assertOwnLocations(tx, [sourceId, targetId])
    await repointLocation(tx, sourceId, targetId)
    await gateway.deleteByID(tx, { collection: 'locations', id: sourceId, depth: 0 })
  })
}
