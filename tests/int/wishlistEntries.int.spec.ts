import { randomUUID } from 'node:crypto'

import { Forbidden, getPayload, NotFound, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, User, WishlistEntry } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'
import { rejectedPaths } from '../helpers/validation'

// `wishlist-entries`, AD-1/AD-8/AD-17, FR-38: owner from the request,
// owner-scoped access that binds the admin too, `wishlist` and `forPerson`
// that must be the user's own rows and a `book` the user may read (foreign
// ids), open by default, the same Book allowed twice.

const ownerId = (doc: { owner: number | User }): number =>
  typeof doc.owner === 'number' ? doc.owner : doc.owner.id

describe('wishlist-entries', () => {
  let payload: Payload
  let a: User
  let b: User
  let admin: User
  let shared: Book

  /** A system write (as `lib/catalogue` makes it) with `user` on the request. */
  const systemBook = async (user: User, visibility: Book['visibility']) =>
    payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  /** A uniquely named list; `owner` and `nameKey` only satisfy the create type. */
  const wishlistAs = async (user: User) =>
    gateway.create(await contextFor(user), {
      collection: 'wishlists',
      data: { owner: user.id, name: `Wishes ${randomUUID()}`, nameKey: 'ignored' },
      depth: 0,
    })

  /** A uniquely named Person; `owner` and `nameKey` only satisfy the create type. */
  const personAs = async (user: User) =>
    gateway.create(await contextFor(user), {
      collection: 'people',
      data: { owner: user.id, name: `Liisa ${randomUUID()}`, nameKey: 'ignored' },
      depth: 0,
    })

  /**
   * An entry created by `user` through the gateway; `owner` only satisfies the
   * create type. The cast lets the missing-field case send an incomplete row.
   */
  const entryAs = async (user: User, data: Partial<WishlistEntry>): Promise<WishlistEntry> =>
    gateway.create(await contextFor(user), {
      collection: 'wishlist-entries',
      data: { owner: user.id, ...data } as Pick<WishlistEntry, 'owner' | 'wishlist' | 'book'>,
      depth: 0,
    })

  const update = async (user: User, id: number, data: Partial<WishlistEntry>) =>
    gateway.updateByID(await contextFor(user), {
      collection: 'wishlist-entries',
      id,
      data,
      depth: 0,
    })

  const systemRead = (id: number) =>
    payload.findByID({ collection: 'wishlist-entries', id, depth: 0 })

  const countOn = async (wishlist: number) =>
    (
      await payload.count({
        collection: 'wishlist-entries',
        where: { wishlist: { equals: wishlist } },
      })
    ).totalDocs

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Wishlist Entries User A' })
    b = await createUser({ displayName: 'Wishlist Entries User B' })
    admin = await createUser({ displayName: 'Wishlist Entries Admin', roles: ['admin'] })
    shared = await systemBook(a, 'shared')
  })

  it('saves an open entry for the request user, the same Book twice', async () => {
    const list = await wishlistAs(a)
    const entry = await entryAs(a, { owner: b.id, wishlist: list.id, book: shared.id })
    expect(ownerId(entry)).toBe(a.id)
    expect(entry.forPerson ?? null).toBeNull()
    expect(entry.closedAt ?? null).toBeNull()

    const asA = await contextFor(a)
    expect((await gateway.findByID(asA, { collection: 'wishlist-entries', id: entry.id })).id).toBe(
      entry.id,
    )
    const found = await gateway.find(asA, {
      collection: 'wishlist-entries',
      where: { id: { equals: entry.id } },
    })
    expect(found.docs.map((doc) => doc.id)).toEqual([entry.id])

    const again = await entryAs(a, { wishlist: list.id, book: shared.id })
    expect(again.id).not.toBe(entry.id)
    expect(await countOn(list.id)).toBe(2)
  })

  it('keeps a recipient and the instant it was closed', async () => {
    const [list, person] = await Promise.all([wishlistAs(a), personAs(a)])
    const entry = await entryAs(a, { wishlist: list.id, book: shared.id, forPerson: person.id })
    expect(entry.forPerson).toBe(person.id)
    const closed = await update(a, entry.id, { closedAt: '2026-10-27T18:45:12.345Z' })
    expect(closed.closedAt).toBe('2026-10-27T18:45:12.345Z')
  })

  it("rejects another user's list, Person or private Book", async () => {
    const [ownList, foreignList, foreignPerson, otherList] = await Promise.all([
      wishlistAs(a),
      wishlistAs(b),
      personAs(b),
      wishlistAs(b),
    ])
    expect(await rejectedPaths(entryAs(a, { wishlist: foreignList.id, book: shared.id }))).toEqual([
      'wishlist',
    ])
    expect(
      await rejectedPaths(
        entryAs(a, { wishlist: ownList.id, book: shared.id, forPerson: foreignPerson.id }),
      ),
    ).toEqual(['forPerson'])

    const privateBook = await systemBook(a, 'private')
    expect(
      await rejectedPaths(entryAs(b, { wishlist: otherList.id, book: privateBook.id })),
    ).toEqual(['book'])
    expect(await countOn(foreignList.id)).toBe(0)
    expect(await countOn(ownList.id)).toBe(0)
    expect(await countOn(otherList.id)).toBe(0)

    await expect(entryAs(a, { wishlist: ownList.id, book: privateBook.id })).resolves.toBeDefined()
  })

  it('hides an entry from another user and the admin, and refuses their writes', async () => {
    const list = await wishlistAs(a)
    const entry = await entryAs(a, { wishlist: list.id, book: shared.id })
    for (const user of [b, admin]) {
      const ctx = await contextFor(user)
      const seen = await gateway.find(ctx, {
        collection: 'wishlist-entries',
        where: { id: { equals: entry.id } },
      })
      expect(seen.docs).toEqual([])
      await expect(
        gateway.findByID(ctx, { collection: 'wishlist-entries', id: entry.id }),
      ).rejects.toThrow(NotFound)
      await expect(
        update(user, entry.id, { closedAt: '2026-10-27T10:00:00.000Z' }),
      ).rejects.toThrow(Forbidden)
      await expect(
        gateway.deleteByID(ctx, { collection: 'wishlist-entries', id: entry.id }),
      ).rejects.toThrow(Forbidden)
    }
    const unchanged = await systemRead(entry.id)
    expect(unchanged.closedAt ?? null).toBeNull()
    expect(ownerId(unchanged)).toBe(a.id)
  })

  it('requires a list and a Book', async () => {
    const list = await wishlistAs(a)
    expect(await rejectedPaths(entryAs(a, { book: shared.id }))).toEqual(['wishlist'])
    expect(await rejectedPaths(entryAs(a, { wishlist: list.id }))).toEqual(['book'])
    expect(await countOn(list.id)).toBe(0)
  })
})
