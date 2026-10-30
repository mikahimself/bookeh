import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createCopy } from '@/lib/copies/createCopy'
import { logger } from '@/lib/errors'
import { lendCopy } from '@/lib/loans/loans'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { undo, withUndo } from '@/lib/undo/undo'
import { closeEntry, createEntry } from '@/lib/wishlists/entries'
import { createWishlist } from '@/lib/wishlists/wishlists'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `closeEntry()`, FR-28/AD-18/AD-20: Bought and Ordered close one entry and
// make a copy only for the user's own wish; Undo deletes the copy and reopens
// the entry. Rows are checked per user: other files write in parallel.

// The real `createCopy()`, made to fail once by the rollback test.
vi.mock('@/lib/copies/createCopy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/copies/createCopy')>()
  return { ...actual, createCopy: vi.fn(actual.createCopy) }
})

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

describe('closeEntry', () => {
  let payload: Payload

  /** A fresh user whose profile default is a new location "Olohuone". */
  const userWithDefault = async () => {
    const created = await createUser({ displayName: 'Close Entry User' })
    const location = await payload.create({
      collection: 'locations',
      data: { owner: created.id, name: 'Olohuone', nameKey: '' },
      overrideAccess: false,
      depth: 0,
      req: (await contextFor(created)).req,
    })
    const user = await payload.update({
      collection: 'users',
      id: created.id,
      data: { defaultLocation: location.id },
      overrideAccess: true,
    })
    return { user, ctx: await contextFor(user), location }
  }

  const sharedBook = async () =>
    payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })

  const ownEntry = async (ctx: Context, bookId: number) => {
    const wishlist = await createWishlist(ctx, unique('Toiveet'))
    return (await createEntry(ctx, { wishlist, bookId })).data.entryId
  }

  /** An entry for a new Person, through the gateway: no service sets a recipient yet. */
  const entryForPerson = async (ctx: Context, book: number) => {
    const wishlist = await createWishlist(ctx, unique('Lahjat'))
    const person = await gateway.create(ctx, {
      collection: 'people',
      data: { owner: ctx.user.id, name: unique('Liisa'), nameKey: 'ignored' },
      depth: 0,
    })
    const entry = await gateway.create(ctx, {
      collection: 'wishlist-entries',
      data: { owner: ctx.user.id, wishlist, book, forPerson: person.id },
      depth: 0,
    })
    return entry.id
  }

  /** `id → closedAt` of the user's entries. */
  const closedAtOf = async (user: User) =>
    Object.fromEntries(
      (
        await payload.find({
          collection: 'wishlist-entries',
          where: { owner: { equals: user.id } },
          overrideAccess: true,
          depth: 0,
          pagination: false,
        })
      ).docs.map((e) => [e.id, e.closedAt ?? null]),
    )

  const copiesOf = async (user: User) =>
    (
      await payload.find({
        collection: 'copies',
        where: { owner: { equals: user.id } },
        overrideAccess: true,
        depth: 0,
        pagination: false,
      })
    ).docs.map((c) => ({
      id: c.id,
      book: c.book,
      status: c.status,
      location: c.location ?? null,
    }))

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // FR-28, decision 1: as a save, every own wish for the Book closes, on any list.
  it('bought, own: closes every own entry for the Book and saves one owned copy at the default location', async () => {
    const { user, ctx, location } = await userWithDefault()
    const x = await sharedBook()
    const entry = await ownEntry(ctx, x.id)
    const other = await ownEntry(ctx, x.id)
    const forPerson = await entryForPerson(ctx, x.id)

    const result = await withUndo(ctx, (tx) => closeEntry(tx, entry, 'bought'))

    expect(result.savedTo).toEqual({ id: location.id, name: 'Olohuone' })
    expect(await copiesOf(user)).toEqual([
      { id: result.copyId, book: x.id, status: 'owned', location: location.id },
    ])
    const after = await closedAtOf(user)
    expect(after[entry]).toEqual(expect.any(String))
    expect(after[other]).toEqual(expect.any(String))
    expect(after[forPerson]).toBeNull()
  })

  it('for a Person: closes that entry alone and leaves own entries open', async () => {
    const { user, ctx } = await userWithDefault()
    const x = await sharedBook()
    const gift = await entryForPerson(ctx, x.id)
    const own = await ownEntry(ctx, x.id)

    await withUndo(ctx, (tx) => closeEntry(tx, gift, 'bought'))

    expect(await copiesOf(user)).toEqual([])
    const after = await closedAtOf(user)
    expect(after[gift]).toEqual(expect.any(String))
    expect(after[own]).toBeNull()
  })

  it('ordered, own: closes the entry and saves an ordered copy with no location', async () => {
    const { user, ctx } = await userWithDefault()
    const x = await sharedBook()
    const entry = await ownEntry(ctx, x.id)

    const result = await withUndo(ctx, (tx) => closeEntry(tx, entry, 'ordered'))

    expect(result.savedTo).toBeNull()
    expect(await copiesOf(user)).toEqual([
      { id: result.copyId, book: x.id, status: 'ordered', location: null },
    ])
    expect((await closedAtOf(user))[entry]).toEqual(expect.any(String))
  })

  it.each(['bought', 'ordered'] as const)(
    '%s, for a Person: closes the entry and makes no copy',
    async (as) => {
      const { user, ctx } = await userWithDefault()
      const x = await sharedBook()
      const entry = await entryForPerson(ctx, x.id)

      const result = await withUndo(ctx, (tx) => closeEntry(tx, entry, as))

      expect(result).toMatchObject({ copyId: null, savedTo: null })
      expect(await copiesOf(user)).toEqual([])
      expect((await closedAtOf(user))[entry]).toEqual(expect.any(String))
    },
  )

  // AD-16: the close is in the copy's transaction, so a failed copy leaves it open.
  it('leaves the entry open when the copy fails after the close', async () => {
    const { user, ctx } = await userWithDefault()
    const x = await sharedBook()
    const entry = await ownEntry(ctx, x.id)
    let closedInClose: unknown
    vi.mocked(createCopy).mockImplementationOnce(async (tx) => {
      closedInClose = (
        await gateway.findByID(tx, { collection: 'wishlist-entries', id: entry, depth: 0 })
      ).closedAt
      throw new Error('copy failed')
    })

    await expect(closeEntry(ctx, entry, 'bought')).rejects.toThrow('copy failed')

    expect(closedInClose).toEqual(expect.any(String))
    expect(await closedAtOf(user)).toEqual({ [entry]: null })
    expect(await copiesOf(user)).toEqual([])
  })

  describe('undo', () => {
    it.each(['bought', 'ordered'] as const)(
      '%s: deletes the copy and reopens an own entry',
      async (as) => {
        const { user, ctx } = await userWithDefault()
        const x = await sharedBook()
        const entry = await ownEntry(ctx, x.id)

        const result = await withUndo(ctx, (tx) => closeEntry(tx, entry, as))
        await undo(ctx, result.undoToken)

        expect(await copiesOf(user)).toEqual([])
        expect(await closedAtOf(user)).toEqual({ [entry]: null })
      },
    )

    it('deletes the one copy and reopens every own entry the close closed, across two lists', async () => {
      const { user, ctx } = await userWithDefault()
      const x = await sharedBook()
      const entry = await ownEntry(ctx, x.id)
      const other = await ownEntry(ctx, x.id)

      const result = await withUndo(ctx, (tx) => closeEntry(tx, entry, 'ordered'))
      await undo(ctx, result.undoToken)

      expect(await copiesOf(user)).toEqual([])
      expect(await closedAtOf(user)).toEqual({ [entry]: null, [other]: null })
    })

    it.each(['bought', 'ordered'] as const)('%s: reopens a Person entry', async (as) => {
      const { user, ctx } = await userWithDefault()
      const x = await sharedBook()
      const entry = await entryForPerson(ctx, x.id)

      const result = await withUndo(ctx, (tx) => closeEntry(tx, entry, as))
      await undo(ctx, result.undoToken)

      expect(await copiesOf(user)).toEqual([])
      expect(await closedAtOf(user)).toEqual({ [entry]: null })
    })

    it('fails with UNDO_FAILED once the copy is lent, keeping copy and close', async () => {
      const { user, ctx } = await userWithDefault()
      const x = await sharedBook()
      const entry = await ownEntry(ctx, x.id)

      const result = await withUndo(ctx, (tx) => closeEntry(tx, entry, 'bought'))
      await lendCopy(ctx, result.copyId!, { create: 'Liisa' })
      const closedAt = (await closedAtOf(user))[entry]
      vi.spyOn(logger(), 'warn').mockImplementation(() => {})

      await expect(undo(ctx, result.undoToken)).rejects.toMatchObject({ code: 'UNDO_FAILED' })

      expect((await copiesOf(user)).map((c) => c.id)).toEqual([result.copyId])
      expect(closedAt).toEqual(expect.any(String))
      expect((await closedAtOf(user))[entry]).toBe(closedAt)
    })

    // AD-20: a restore skips rows that are gone.
    it('succeeds once the entry is gone, deleting the copy', async () => {
      const { user, ctx } = await userWithDefault()
      const x = await sharedBook()
      const entry = await ownEntry(ctx, x.id)

      const result = await withUndo(ctx, (tx) => closeEntry(tx, entry, 'bought'))
      await gateway.deleteByID(ctx, { collection: 'wishlist-entries', id: entry, depth: 0 })

      await expect(undo(ctx, result.undoToken)).resolves.toBeUndefined()

      expect(await copiesOf(user)).toEqual([])
      expect(await closedAtOf(user)).toEqual({})
    })
  })

  it('fails with NOT_FOUND for a closed, a foreign or a non-row id, writing nothing', async () => {
    const a = await userWithDefault()
    const b = await userWithDefault()
    const x = await sharedBook()
    const closed = await ownEntry(a.ctx, x.id)
    const t0 = '2026-10-01T08:00:00.000Z'
    await gateway.updateByID(a.ctx, {
      collection: 'wishlist-entries',
      id: closed,
      data: { closedAt: t0 },
      depth: 0,
    })
    const foreign = await ownEntry(b.ctx, x.id)

    for (const id of [closed, foreign, 0, 2147483647]) {
      await expect(closeEntry(a.ctx, id, 'bought')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }

    expect(await copiesOf(a.user)).toEqual([])
    expect(await copiesOf(b.user)).toEqual([])
    expect(await closedAtOf(a.user)).toEqual({ [closed]: t0 })
    expect(await closedAtOf(b.user)).toEqual({ [foreign]: null })
  })
})
