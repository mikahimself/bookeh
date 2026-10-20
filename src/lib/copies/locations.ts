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
