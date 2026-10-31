import { limits } from '@/fields/limits'
import { toNameKey } from '@/fields/nameKey'
import { normaliseName } from '@/fields/sortName'
import { DomainError } from '@/lib/errors'

import type { Context } from './context'
import * as gateway from './gateway'
import { isRowId, type Ref } from './ref'

/** The private name-keyed collections a `Ref` can resolve in. */
type OwnedCollection = 'locations' | 'people' | 'wishlists'

/**
 * A typed name, normalised (NFC, trimmed, whitespace collapsed). Blank after
 * normalising fails with `VALIDATION` on `field`; longer than `maxLength`
 * fails with `VALIDATION` and `field` marked `TOO_LONG`, never clipped
 * (spine, Text input).
 */
export function normalisedName(
  name: string,
  field: string,
  maxLength: number = limits.name,
): string {
  const normalised = normaliseName(name)
  if (normalised === '') throw new DomainError('VALIDATION', { fields: { [field]: 'VALIDATION' } })
  if (normalised.length > maxLength) {
    throw new DomainError('VALIDATION', { fields: { [field]: 'TOO_LONG' } })
  }
  return normalised
}

/** The context user's row keyed `key`, other than `exceptId`, or undefined. */
export async function ownedRowKeyed(
  ctx: Context,
  collection: OwnedCollection,
  key: string,
  exceptId?: number,
): Promise<number | undefined> {
  const { docs } = await gateway.find(ctx, {
    collection,
    where: {
      and: [
        { nameKey: { equals: key } },
        { owner: { equals: ctx.user.id } },
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
 * Whether every id (distinct) is one of the context user's rows. `count`, not
 * `findByID`: a `NotFound` would end the transaction. Filters on `owner`
 * explicitly as well as through `ownerAccess`, so the admin is held to their
 * own rows too (FR-48).
 */
export async function ownsRows(
  ctx: Context,
  collection: OwnedCollection,
  ids: number[],
): Promise<boolean> {
  const { totalDocs } = await gateway.count(ctx, {
    collection,
    where: { and: [{ id: { in: ids } }, { owner: { equals: ctx.user.id } }] },
  })
  return totalDocs === ids.length
}

/**
 * Spine, AD-18 and Ref: the resolution the owning services share. An id must
 * be the context user's row and a name is matched by `nameKey` among their
 * rows, or created when none matches. `checks: 'atWrite'` is the location
 * rule: an id comes back unchecked and an over-long name goes on to the write,
 * which refuses both; blank still fails on `field` before any read. Opens no
 * transaction: it runs on the caller's context.
 */
export async function resolveOwnedName(
  ctx: Context,
  ref: Ref,
  {
    collection,
    field,
    checks = 'upfront',
  }: { collection: OwnedCollection; field: string; checks?: 'upfront' | 'atWrite' },
): Promise<number> {
  const upfront = checks === 'upfront'
  if (typeof ref === 'number') {
    if (upfront && !(isRowId(ref) && (await ownsRows(ctx, collection, [ref])))) {
      throw new DomainError('VALIDATION', { fields: { [field]: 'VALIDATION' } })
    }
    return ref
  }

  const name = normalisedName(ref.create, field, upfront ? limits.name : Infinity)
  const found = await ownedRowKeyed(ctx, collection, toNameKey(name))
  if (found !== undefined) return found

  // `owner` and `nameKey` are what Payload's create type requires; the hooks set both.
  const created = await gateway.create(ctx, {
    collection,
    data: { owner: ctx.user.id, name, nameKey: '' },
    depth: 0,
  })
  return created.id
}
