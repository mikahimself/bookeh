import { limits } from '@/fields/limits'
import { toNameKey } from '@/fields/nameKey'
import { normaliseName } from '@/fields/sortName'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf, isRowId, type Ref } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'

/** Spine, Shared shapes. Declared here: `lib/people` imports no other service. */
type Named = { id: number; name: string }

/** Spine, Shared shapes: a Person with their number of loans, open and returned. Epic 7 adds entries. */
export type PersonUse = Named & { loans: number }

/**
 * A typed name, normalised (NFC, trimmed, whitespace collapsed). Blank after
 * normalising fails with `VALIDATION` on `field`; longer than `limits.name`
 * fails with `VALIDATION` and `field` marked `TOO_LONG`, never clipped
 * (spine, Text input).
 */
function normalisedName(name: string, field: 'person' | 'name'): string {
  const normalised = normaliseName(name)
  if (normalised === '') throw new DomainError('VALIDATION', { fields: { [field]: 'VALIDATION' } })
  if (normalised.length > limits.name) {
    throw new DomainError('VALIDATION', { fields: { [field]: 'TOO_LONG' } })
  }
  return normalised
}

/** The context user's Person keyed `key`, other than `exceptId`, or undefined. */
async function takenBy(tx: Context, key: string, exceptId?: number): Promise<number | undefined> {
  const { docs } = await gateway.find(tx, {
    collection: 'people',
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
 * Whether every id (distinct) is one of the context user's People. `count`,
 * not `findByID`: a `NotFound` would end the transaction. Filters on `owner`
 * explicitly as well as through `ownerAccess`, so the admin is held to their
 * own People too (FR-48).
 */
async function ownsPeople(tx: Context, ids: number[]): Promise<boolean> {
  const { totalDocs } = await gateway.count(tx, {
    collection: 'people',
    where: { and: [{ id: { in: ids } }, { owner: { equals: tx.user.id } }] },
  })
  return totalDocs === ids.length
}

/** Fails with `NOT_FOUND` unless every id (distinct) is one of the context user's People. */
async function assertOwnPeople(tx: Context, ids: number[]): Promise<void> {
  if (!(await ownsPeople(tx, ids))) throw new DomainError('NOT_FOUND')
}

/**
 * Spine, AD-18 and Ref, FR-34: resolves a Person `Ref` to an id of the context
 * user's own Person. An id that is not a row id or not one of the viewer's
 * People (gone, or another user's, for the admin too) fails with `VALIDATION`
 * on `person`, the picker's field. A name is normalised and matched by
 * `nameKey` among the viewer's People (no accent folding, no fuzzy matching),
 * or created when none matches; blank or longer than `limits.name` fails on
 * `person` before any read. Opens no transaction: it runs on the caller's
 * context, joining the action's transaction; a Person created here stays after
 * Undo. A lost race between two creates of one name surfaces as the unique
 * index's `ValidationError`, unchanged.
 */
export async function resolvePerson(ctx: Context, ref: Ref): Promise<number> {
  if (typeof ref === 'number') {
    if (!isRowId(ref) || !(await ownsPeople(ctx, [ref]))) {
      throw new DomainError('VALIDATION', { fields: { person: 'VALIDATION' } })
    }
    return ref
  }

  const name = normalisedName(ref.create, 'person')
  const found = await takenBy(ctx, toNameKey(name))
  if (found !== undefined) return found

  // `owner` and `nameKey` are what Payload's create type requires; the hooks set both.
  const created = await gateway.create(ctx, {
    collection: 'people',
    data: { owner: ctx.user.id, name, nameKey: '' },
    depth: 0,
  })
  return created.id
}

/**
 * Spine, AD-18, FR-34: "Add person". Adds a Person for the context user in the
 * caller's transaction or one of its own (AD-16) and answers its id. Unlike
 * `resolvePerson()`, a name in use is no match but a failure: blank or longer
 * than `limits.name` fails with `VALIDATION` on `name`; another of the
 * viewer's People with the same `nameKey` fails with `NAME_TAKEN` and its id
 * as `conflictId`. Both before any write. No Undo. A lost race
 * against a concurrent create or rename surfaces as the unique index's
 * `ValidationError`, unchanged.
 */
export async function createPerson(ctx: Context, name: string): Promise<number> {
  const normalised = normalisedName(name, 'name')

  return withTransaction(ctx, async (tx) => {
    const taken = await takenBy(tx, toNameKey(normalised))
    if (taken !== undefined) throw new DomainError('NAME_TAKEN', { conflictId: taken })

    // `owner` and `nameKey` are what Payload's create type requires; the hooks set both.
    const created = await gateway.create(tx, {
      collection: 'people',
      data: { owner: tx.user.id, name: normalised, nameKey: '' },
      depth: 0,
    })
    return created.id
  })
}

/**
 * Spine, AD-18, FR-34: renames one of the context user's People in the
 * caller's transaction or one of its own (AD-16). An id that is not a row id,
 * or not the viewer's Person (the admin's included), fails with `NOT_FOUND`;
 * blank or longer than `limits.name` fails with `VALIDATION` on `name`;
 * another of the viewer's People with the same `nameKey` fails with
 * `NAME_TAKEN` and its id as `conflictId`, so the caller can offer a merge. A
 * case-only rename keeps the Person's own key and succeeds. All before any
 * write; the `nameKey` hook recomputes the key. No Undo. A lost race
 * against a concurrent create or rename surfaces as the unique index's
 * `ValidationError`, unchanged.
 */
export async function renamePerson(ctx: Context, id: number, name: string): Promise<void> {
  if (!isRowId(id)) throw new DomainError('NOT_FOUND')
  const normalised = normalisedName(name, 'name')

  await withTransaction(ctx, async (tx) => {
    await assertOwnPeople(tx, [id])
    const taken = await takenBy(tx, toNameKey(normalised), id)
    if (taken !== undefined) throw new DomainError('NAME_TAKEN', { conflictId: taken })

    await gateway.updateByID(tx, {
      collection: 'people',
      id,
      data: { name: normalised },
      depth: 0,
    })
  })
}

/** The ids of the context user's loans to Person `id`. */
async function loansOf(tx: Context, id: number): Promise<number[]> {
  const { docs } = await gateway.find(tx, {
    collection: 'loans',
    where: { and: [{ person: { equals: id } }, { owner: { equals: tx.user.id } }] },
    select: { person: true },
    depth: 0,
    pagination: false,
  })
  return docs.map((doc) => doc.id)
}

/**
 * Spine, AD-18, FR-34: merges one of the context user's People into another
 * in the caller's transaction or one of its own (AD-16). Either id not a row
 * id, or not the viewer's Person (the admin's included), fails with
 * `NOT_FOUND`; merging a Person into itself fails with `VALIDATION`; both
 * before any write. Every loan of the source, open or returned, moves to the
 * target through the gateway, then the source is deleted. Epic 7 moves
 * wishlist entries too. No Undo. A loan to the
 * Person committed concurrently after the check makes the delete fail on
 * `loans.person_id` (NOT NULL with `ON DELETE set null`), and the whole call
 * rolls back as `INTERNAL`.
 */
export async function mergePerson(ctx: Context, sourceId: number, targetId: number): Promise<void> {
  if (!isRowId(sourceId) || !isRowId(targetId)) throw new DomainError('NOT_FOUND')
  if (sourceId === targetId) throw new DomainError('VALIDATION')

  await withTransaction(ctx, async (tx) => {
    await assertOwnPeople(tx, [sourceId, targetId])
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const loan of await loansOf(tx, sourceId)) {
      await gateway.updateByID(tx, {
        collection: 'loans',
        id: loan,
        data: { person: targetId },
        depth: 0,
      })
    }
    await gateway.deleteByID(tx, { collection: 'people', id: sourceId, depth: 0 })
  })
}

/**
 * Spine, AD-18, FR-34: deletes one of the context user's People in the
 * caller's transaction or one of its own (AD-16). An id that is not a row id,
 * or not the viewer's Person (the admin's included), fails with `NOT_FOUND`; a
 * Person with any loan, open or returned, fails with `PERSON_IN_USE`; both
 * before any write. Epic 7 adds wishlist entries to the rule. No Undo. A loan to the
 * Person committed concurrently after the check makes the delete fail on
 * `loans.person_id` (NOT NULL with `ON DELETE set null`), and the whole call
 * rolls back as `INTERNAL`.
 */
export async function deletePerson(ctx: Context, id: number): Promise<void> {
  if (!isRowId(id)) throw new DomainError('NOT_FOUND')

  await withTransaction(ctx, async (tx) => {
    await assertOwnPeople(tx, [id])
    const { totalDocs } = await gateway.count(tx, {
      collection: 'loans',
      where: { and: [{ person: { equals: id } }, { owner: { equals: tx.user.id } }] },
    })
    if (totalDocs > 0) throw new DomainError('PERSON_IN_USE')

    await gateway.deleteByID(tx, { collection: 'people', id, depth: 0 })
  })
}

/**
 * Spine, AD-18, FR-34: every Person of the context user, sorted by name in the
 * database's collation, with their number of loans, open and returned, zero
 * included. Never another user's, for the admin too (FR-48). Epic 7 adds
 * entries.
 */
export async function personUse(ctx: Context): Promise<PersonUse[]> {
  const own = { owner: { equals: ctx.user.id } }
  const people = await gateway.find(ctx, {
    collection: 'people',
    where: own,
    sort: 'name',
    pagination: false,
    depth: 0,
    select: { name: true },
  })
  const loans = await gateway.find(ctx, {
    collection: 'loans',
    where: own,
    pagination: false,
    depth: 0,
    select: { person: true },
  })

  const counts = new Map<number, number>()
  for (const { person } of loans.docs) {
    const id = idOf(person)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return people.docs.map(({ id, name }) => ({ id, name, loans: counts.get(id) ?? 0 }))
}
