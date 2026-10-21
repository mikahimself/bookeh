import { toNameKey } from '@/fields/nameKey'
import { normaliseName } from '@/fields/sortName'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import type { Ref } from '@/lib/payload/ref'

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
  if (fallback === null || fallback === undefined) return null
  return typeof fallback === 'number' ? fallback : fallback.id
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
