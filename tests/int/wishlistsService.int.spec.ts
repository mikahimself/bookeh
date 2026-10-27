import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { limits } from '@/fields/limits'
import * as gateway from '@/lib/payload/gateway'
import { MAX_ROW_ID } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import {
  createWishlist,
  deleteWishlist,
  renameWishlist,
  resolveWishlist,
} from '@/lib/wishlists/wishlists'
import config from '@/payload.config'
import type { Book, User, Wishlist, WishlistEntry } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `lib/wishlists`, AD-18/FR-38/FR-39: a wishlist `Ref` resolves only to my own
// lists or matches a name of mine; "New list" and rename fail `NAME_TAKEN`
// with the other's id; deleting a list deletes its entries, open and closed,
// in one transaction. Foreign and bad ids write nothing, for the admin too.

describe('wishlists service', () => {
  let payload: Payload
  let shared: Book

  /** `owner` and `nameKey` only satisfy the create type; the hooks set both. */
  const wishlistAs = async (user: User, name: string): Promise<Wishlist> =>
    gateway.create(await contextFor(user), {
      collection: 'wishlists',
      data: { owner: user.id, name, nameKey: 'ignored' },
      depth: 0,
    })

  const entryAs = async (user: User, wishlist: number, closedAt?: string): Promise<WishlistEntry> =>
    gateway.create(await contextFor(user), {
      collection: 'wishlist-entries',
      data: { owner: user.id, wishlist, book: shared.id, ...(closedAt && { closedAt }) },
      depth: 0,
    })

  const listsOf = async (user: User) =>
    (
      await payload.find({
        collection: 'wishlists',
        where: { owner: { equals: user.id } },
        sort: 'name',
        depth: 0,
        pagination: false,
      })
    ).docs.map(({ id, name }) => ({ id, name }))

  const exists = async (collection: 'wishlists' | 'wishlist-entries', id: number) =>
    (await payload.count({ collection, where: { id: { equals: id } } })).totalDocs === 1

  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e)

  beforeAll(async () => {
    payload = await getPayload({ config })
    const creator = await createUser({ displayName: 'Wishlists Service Book' })
    shared = await payload.create({
      collection: 'books',
      data: { title: 'Kalevala', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(creator)).req,
    })
  })

  it('resolves my own id, matches my name by nameKey and creates a new one', async () => {
    const a = await createUser({ displayName: 'Resolve Wishlist' })
    const b = await createUser({ displayName: 'Resolve Wishlist Other' })
    const asA = await contextFor(a)
    const joulu = await wishlistAs(a, 'Joulu')
    const theirs = await wishlistAs(b, 'Me')

    expect(await resolveWishlist(asA, joulu.id)).toBe(joulu.id)
    expect(await resolveWishlist(asA, { create: '  joulu ' })).toBe(joulu.id)
    const me = await resolveWishlist(asA, { create: 'Me' })

    expect(me).not.toBe(theirs.id)
    expect(await listsOf(a)).toEqual([
      { id: joulu.id, name: 'Joulu' },
      { id: me, name: 'Me' },
    ])
    expect(await listsOf(b)).toEqual([{ id: theirs.id, name: 'Me' }])
  })

  it('refuses a foreign or bad id and a blank or long name on wishlist, writing nothing', async () => {
    const a = await createUser({ displayName: 'Resolve Wishlist Viewer' })
    const admin = await createUser({ displayName: 'Resolve Wishlist Admin', roles: ['admin'] })
    const b = await createUser({ displayName: 'Resolve Wishlist Foreign' })
    const theirs = await wishlistAs(b, 'Me')

    const invalid = { code: 'VALIDATION', fields: { wishlist: 'VALIDATION' } }
    for (const viewer of [a, admin]) {
      const ctx = await contextFor(viewer)
      for (const bad of [theirs.id, 0, MAX_ROW_ID + 1]) {
        expect(await failure(resolveWishlist(ctx, bad))).toMatchObject(invalid)
      }
    }
    const asA = await contextFor(a)
    expect(await failure(resolveWishlist(asA, { create: '   ' }))).toMatchObject(invalid)
    expect(
      await failure(resolveWishlist(asA, { create: 'x'.repeat(limits.name + 1) })),
    ).toMatchObject({ code: 'VALIDATION', fields: { wishlist: 'TOO_LONG' } })

    expect(await listsOf(a)).toEqual([])
    expect(await listsOf(admin)).toEqual([])
  })

  it("creates a list, and fails NAME_TAKEN with the existing one's id", async () => {
    const a = await createUser({ displayName: 'Create Wishlist' })
    const asA = await contextFor(a)

    const christmas = await createWishlist(asA, ' Christmas ')
    expect(await failure(createWishlist(asA, 'christmas'))).toMatchObject({
      code: 'NAME_TAKEN',
      conflictId: christmas,
    })
    expect(await failure(createWishlist(asA, '   '))).toMatchObject({
      code: 'VALIDATION',
      fields: { name: 'VALIDATION' },
    })
    expect(await failure(createWishlist(asA, 'x'.repeat(limits.name + 1)))).toMatchObject({
      code: 'VALIDATION',
      fields: { name: 'TOO_LONG' },
    })
    expect(await listsOf(a)).toEqual([{ id: christmas, name: 'Christmas' }])
  })

  it("renames case-only, and fails a rename onto a taken name with the other's id", async () => {
    const a = await createUser({ displayName: 'Rename Wishlist' })
    const asA = await contextFor(a)
    const joulu = await wishlistAs(a, 'Joulu')
    const me = await wishlistAs(a, 'Me')

    expect(await failure(renameWishlist(asA, me.id, 'JOULU'))).toMatchObject({
      code: 'NAME_TAKEN',
      conflictId: joulu.id,
    })
    expect(await failure(renameWishlist(asA, joulu.id, '   '))).toMatchObject({
      code: 'VALIDATION',
      fields: { name: 'VALIDATION' },
    })
    expect(await failure(renameWishlist(asA, joulu.id, 'x'.repeat(limits.name + 1)))).toMatchObject(
      {
        code: 'VALIDATION',
        fields: { name: 'TOO_LONG' },
      },
    )
    await renameWishlist(asA, joulu.id, ' JOULU ')

    expect(await listsOf(a)).toEqual([
      { id: joulu.id, name: 'JOULU' },
      { id: me.id, name: 'Me' },
    ])
  })

  it("refuses another user's list and bad ids with NOT_FOUND, writing nothing", async () => {
    const a = await createUser({ displayName: 'Wishlists Viewer' })
    const admin = await createUser({ displayName: 'Wishlists Admin', roles: ['admin'] })
    const b = await createUser({ displayName: 'Wishlists Other' })
    const theirs = await wishlistAs(b, 'Me')
    const theirEntry = await entryAs(b, theirs.id)

    for (const viewer of [a, admin]) {
      const ctx = await contextFor(viewer)
      for (const bad of [theirs.id, -1, MAX_ROW_ID + 1]) {
        expect(await failure(renameWishlist(ctx, bad, 'Joulu'))).toMatchObject({
          code: 'NOT_FOUND',
        })
        expect(await failure(deleteWishlist(ctx, bad))).toMatchObject({ code: 'NOT_FOUND' })
      }
    }

    expect(await listsOf(b)).toEqual([{ id: theirs.id, name: 'Me' }])
    expect(await exists('wishlist-entries', theirEntry.id)).toBe(true)
  })

  it('deletes a list with its open and closed entries, and nothing else', async () => {
    const a = await createUser({ displayName: 'Delete Wishlist' })
    const b = await createUser({ displayName: 'Delete Wishlist Other' })
    const list = await wishlistAs(a, 'Joulu')
    const other = await wishlistAs(a, 'Me')
    const theirs = await wishlistAs(b, 'Joulu')
    const open = await entryAs(a, list.id)
    const closed = await entryAs(a, list.id, '2026-10-23T10:00:00.000Z')
    const othersEntry = await entryAs(a, other.id)
    const theirEntry = await entryAs(b, theirs.id)

    await deleteWishlist(await contextFor(a), list.id)

    expect(await exists('wishlists', list.id)).toBe(false)
    expect(await exists('wishlist-entries', open.id)).toBe(false)
    expect(await exists('wishlist-entries', closed.id)).toBe(false)
    expect(await exists('wishlists', other.id)).toBe(true)
    expect(await exists('wishlist-entries', othersEntry.id)).toBe(true)
    expect(await exists('wishlists', theirs.id)).toBe(true)
    expect(await exists('wishlist-entries', theirEntry.id)).toBe(true)
  })

  it("rolls a delete back with the caller's transaction", async () => {
    const a = await createUser({ displayName: 'Delete Wishlist Rollback' })
    const list = await wishlistAs(a, 'Joulu')
    const open = await entryAs(a, list.id)
    const closed = await entryAs(a, list.id, '2026-10-23T10:00:00.000Z')

    const e = new Error('after')
    await expect(
      withTransaction(await contextFor(a), async (tx) => {
        await deleteWishlist(tx, list.id)
        throw e
      }),
    ).rejects.toBe(e)

    expect(await exists('wishlists', list.id)).toBe(true)
    expect(await exists('wishlist-entries', open.id)).toBe(true)
    expect(await exists('wishlist-entries', closed.id)).toBe(true)
  })
})
