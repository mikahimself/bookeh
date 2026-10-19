import type { Where } from 'payload'

import { toNameKey } from '@/fields/nameKey'
import { deriveSortName, normaliseName } from '@/fields/sortName'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { assertLive, withTransaction } from '@/lib/payload/transaction'
import type { Author, Series } from '@/payload-types'

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
 * Spine, AD-5 and AD-18: the one matcher of `authors` and `series`. Matches
 * the normalised name by `nameKey` equality (no accent folding, no fuzzy
 * matching) in `scope` and creates the row there when none matches: a
 * `'shared'` scope sees shared rows only; a `'private'` scope sees shared
 * rows first, then the caller's own private rows, never another user's (the
 * admin included), and creates a private row with the caller as `createdBy`.
 * Runs with system privileges inside the caller's transaction or one of its
 * own (AD-3, AD-16), so a save that lists one author twice gets one row.
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
  const key = toNameKey(name)
  const sortName =
    collection === 'authors' && 'sortName' in input && typeof input.sortName === 'string'
      ? normaliseName(input.sortName)
      : ''

  return withTransaction(ctx, async (tx) => {
    const { payload } = tx.req
    const system = { req: tx.req, overrideAccess: true, depth: 0 } as const

    const match = async (where: Where): Promise<Author | Series | undefined> => {
      assertLive(tx)
      const { docs } = await payload.find({
        collection,
        where,
        limit: 1,
        pagination: false,
        ...system,
      })
      return docs[0]
    }

    const shared: Where = {
      and: [{ visibility: { equals: 'shared' } }, { nameKey: { equals: key } }],
    }
    const own: Where = {
      and: [
        { visibility: { equals: 'private' } },
        { createdBy: { equals: tx.user.id } },
        { nameKey: { equals: key } },
      ],
    }
    const row = (await match(shared)) ?? (scope === 'private' ? await match(own) : undefined)

    if (row) {
      if (collection === 'authors' && sortName !== '') {
        const stored = (row as Author).sortName ?? ''
        if (sortName !== stored && (stored === '' || stored === deriveSortName(row.name))) {
          assertLive(tx)
          await payload.update({
            collection: 'authors',
            id: row.id,
            data: { sortName },
            ...system,
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
            ...system,
          })
        : await payload.create({ collection: 'series', data, ...system })
    return { id: created.id, created: true }
  })
}
