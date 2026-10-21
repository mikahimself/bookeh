import type { Where } from 'payload'

import { toNameKey } from '@/fields/nameKey'
import { deriveSortName, normaliseName } from '@/fields/sortName'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { assertLive, withTransaction } from '@/lib/payload/transaction'
import type { Author, Series } from '@/payload-types'

import { system } from './system'

export type NamedCollection = 'authors' | 'series'
export type NameScope = 'shared' | 'private'

/** The name to match, with the source's inverted form for an author. */
export type NameInput<C extends NamedCollection> = C extends 'authors'
  ? {
      name: string
      /** The source's inverted form only, never client-typed text: it can land on a shared row (AD-5). */
      sortName?: string
    }
  : { name: string }

export type FoundOrCreated = { id: number; created: boolean }

/**
 * Spine, AD-5 and FR-13: the read half of `findOrCreateByName()`, which lookup
 * and save both call. Returns the row a save in `scope` would link `name` to,
 * or `undefined` when it would create one: `nameKey` equality on the
 * normalised name (no accent folding, no fuzzy matching), shared rows first,
 * then in the `'private'` scope the caller's own private rows, never another
 * user's (the admin included). Reads with system privileges on `ctx.req`;
 * writes nothing and opens no transaction. A blank name matches no row.
 */
export async function findByName(
  ctx: Context,
  collection: NamedCollection,
  scope: NameScope,
  name: string,
): Promise<Author | Series | undefined> {
  const key = toNameKey(normaliseName(name))

  const match = async (where: Where): Promise<Author | Series | undefined> => {
    assertLive(ctx)
    const { docs } = await ctx.req.payload.find({
      collection,
      where,
      limit: 1,
      pagination: false,
      ...system(ctx),
    })
    return docs[0]
  }

  const shared: Where = {
    and: [{ visibility: { equals: 'shared' } }, { nameKey: { equals: key } }],
  }
  const own: Where = {
    and: [
      { visibility: { equals: 'private' } },
      { createdBy: { equals: ctx.user.id } },
      { nameKey: { equals: key } },
    ],
  }
  return (await match(shared)) ?? (scope === 'private' ? await match(own) : undefined)
}

/**
 * Spine, AD-5 and AD-18: the one writer of `authors` and `series`. Matches
 * through `findByName()` and creates the row in `scope` when none matches,
 * a private row with the caller as `createdBy`. Runs with system privileges
 * inside the caller's transaction or one of its own (AD-3, AD-16), so a save
 * that lists one author twice gets one row.
 *
 * An author's `sortName` from the source is stored on create. On a match it
 * replaces a stored `sortName` that is empty or still the one derived from
 * the stored name; a hand-set one is kept. Series carry no `sortName`.
 * `sortName` is the source's inverted form only, never client-typed text: a
 * private-scope call that matches a shared author refreshes that shared row,
 * and shared values never come from the client (AD-5).
 *
 * A name blank after trimming fails with `VALIDATION` on `name` before any
 * read or write. A lost race between two concurrent creates of one name
 * surfaces as the unique index's `ValidationError`, unchanged. In the private
 * scope a shared row created by someone else between the shared match and
 * the private create is not caught (the partial indexes differ): the private
 * duplicate stays and every later call shadows it behind the shared row.
 */
export async function findOrCreateByName<C extends NamedCollection>(
  ctx: Context,
  collection: C,
  scope: NameScope,
  input: NameInput<C>,
): Promise<FoundOrCreated> {
  const name = normaliseName(input.name)
  if (name === '') throw new DomainError('VALIDATION', { fields: { name: 'VALIDATION' } })
  const sortName =
    collection === 'authors' && 'sortName' in input && typeof input.sortName === 'string'
      ? normaliseName(input.sortName)
      : ''

  return withTransaction(ctx, async (tx) => {
    const { payload } = tx.req
    const row = await findByName(tx, collection, scope, name)

    if (row) {
      if (collection === 'authors' && sortName !== '') {
        const stored = (row as Author).sortName ?? ''
        if (sortName !== stored && (stored === '' || stored === deriveSortName(row.name))) {
          assertLive(tx)
          await payload.update({
            collection: 'authors',
            id: row.id,
            data: { sortName },
            ...system(tx),
          })
        }
      }
      return { id: row.id, created: false }
    }

    assertLive(tx)
    // `nameKey` is what Payload's create type requires; the field hook derives it.
    const data = { name, nameKey: '', visibility: scope }
    const created =
      collection === 'authors'
        ? await payload.create({
            collection: 'authors',
            data: sortName === '' ? data : { ...data, sortName },
            ...system(tx),
          })
        : await payload.create({ collection: 'series', data, ...system(tx) })
    return { id: created.id, created: true }
  })
}
