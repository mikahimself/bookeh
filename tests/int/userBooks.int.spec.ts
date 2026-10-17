import {
  createLocalReq,
  Forbidden,
  getPayload,
  NotFound,
  type Payload,
  ValidationError,
} from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, User, UserBook } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'
import { rejectedPaths } from '../helpers/validation'

// `user-books`, AD-1/AD-6/AD-17/AD-19: rows reach their owner only, for
// every role; `book` is limited to Books the owner reads; `overridden` and
// `rating` reject bad values; one row per owner and Book.

describe('user-books', () => {
  let payload: Payload
  let a: User
  let b: User
  let admin: User

  /** A Book as `lib/catalogue` creates it, with a fresh ISBN. */
  const bookFor = async (user: User, visibility: Book['visibility']) =>
    payload.create({
      collection: 'books',
      data: { title: 'Kalevala', isbn13: randomIsbn(), visibility },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  /** A row created by `user` through the gateway. */
  const createRow = async (user: User, book: Book, extra: Partial<UserBook> = {}) =>
    gateway.create(await contextFor(user), {
      collection: 'user-books',
      data: { owner: user.id, book: book.id, ...extra },
      depth: 0,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'UserBooks User A' })
    b = await createUser({ displayName: 'UserBooks User B' })
    admin = await createUser({ displayName: 'UserBooks Admin', roles: ['admin'] })
  })

  it('saves an own row with the owner taken from the request', async () => {
    const book = await bookFor(a, 'shared')
    const ratedAt = '2026-10-17T07:00:00.000Z'
    const saved = await gateway.create(await contextFor(a), {
      collection: 'user-books',
      data: {
        owner: b.id,
        book: book.id,
        title: 'Kalevala (oma)',
        overridden: ['title'],
        read: true,
        rating: 4,
        ratedAt,
      },
      depth: 0,
    })
    expect(saved.owner).toBe(a.id)
    expect(saved).toMatchObject({
      book: book.id,
      title: 'Kalevala (oma)',
      overridden: ['title'],
      read: true,
      rating: 4,
      ratedAt,
    })
  })

  it('shows a row to its owner only, the admin included', async () => {
    const row = await createRow(a, await bookFor(a, 'shared'))
    const where = { id: { equals: row.id } }

    const asA = await contextFor(a)
    const seenByA = await gateway.find(asA, { collection: 'user-books', where })
    expect(seenByA.docs.map((doc) => doc.id)).toEqual([row.id])
    expect((await gateway.findByID(asA, { collection: 'user-books', id: row.id })).id).toBe(row.id)

    for (const user of [b, admin]) {
      const ctx = await contextFor(user)
      const seen = await gateway.find(ctx, { collection: 'user-books', where })
      expect(seen.docs).toEqual([])
      await expect(gateway.findByID(ctx, { collection: 'user-books', id: row.id })).rejects.toThrow(
        NotFound,
      )
    }
  })

  it("refuses another user's update and delete, the admin included", async () => {
    const row = await createRow(a, await bookFor(a, 'shared'), { title: 'Mine' })
    // A row the access `where` excludes: Payload answers a by-id write with
    // Forbidden (updateByID / deleteByID), a by-id read with NotFound.
    for (const user of [b, admin]) {
      const ctx = await contextFor(user)
      await expect(
        gateway.updateByID(ctx, {
          collection: 'user-books',
          id: row.id,
          data: { title: 'Theirs' },
        }),
      ).rejects.toThrow(Forbidden)
      await expect(
        gateway.deleteByID(ctx, { collection: 'user-books', id: row.id }),
      ).rejects.toThrow(Forbidden)
    }
    const unchanged = await payload.findByID({ collection: 'user-books', id: row.id, depth: 0 })
    expect(unchanged.title).toBe('Mine')
  })

  it("rejects another user's private Book and accepts the owner's own", async () => {
    const foreign = await bookFor(b, 'private')
    expect(await rejectedPaths(createRow(a, foreign))).toEqual(['book'])
    const { totalDocs } = await payload.count({
      collection: 'user-books',
      where: { book: { equals: foreign.id } },
    })
    expect(totalDocs).toBe(0)

    const own = await bookFor(a, 'private')
    expect((await createRow(a, own)).book).toBe(own.id)
  })

  it('keeps one row per owner and Book', async () => {
    const book = await bookFor(a, 'shared')
    await createRow(a, book)
    await expect(createRow(a, book)).rejects.toThrow(ValidationError)
    expect((await createRow(b, book)).book).toBe(book.id)
  })

  it('rejects overridden names outside the set, duplicates and ratings out of range', async () => {
    const book = await bookFor(a, 'shared')
    // `overridden` is typed as the overridable names; the bad lists need the cast.
    const overridden = (names: string[]) => names as unknown as UserBook['overridden']
    const cases: [Partial<UserBook>, string][] = [
      [{ overridden: overridden(['isbn13']) }, 'overridden'],
      [{ overridden: overridden(['title', 'title']) }, 'overridden'],
      [{ rating: 6 }, 'rating'],
      [{ rating: 3.5 }, 'rating'],
      [{ rating: 0 }, 'rating'],
    ]
    for (const [extra, path] of cases) {
      expect(await rejectedPaths(createRow(a, book, extra))).toEqual([path])
    }
  })

  it('refuses every operation without a user', async () => {
    const book = await bookFor(a, 'shared')
    const row = await createRow(a, book, { title: 'Mine' })
    const anonymous = async () => ({
      req: await createLocalReq({}, payload),
      user: null,
      overrideAccess: false as const,
    })
    const collection = 'user-books' as const
    await expect(
      payload.create({ collection, data: { owner: a.id, book: book.id }, ...(await anonymous()) }),
    ).rejects.toThrow(Forbidden)
    await expect(
      payload.find({ collection, where: { id: { equals: row.id } }, ...(await anonymous()) }),
    ).rejects.toThrow(Forbidden)
    await expect(
      payload.findByID({ collection, id: row.id, ...(await anonymous()) }),
    ).rejects.toThrow(Forbidden)
    await expect(
      payload.update({ collection, id: row.id, data: { title: 'Theirs' }, ...(await anonymous()) }),
    ).rejects.toThrow(Forbidden)
    await expect(
      payload.delete({ collection, id: row.id, ...(await anonymous()) }),
    ).rejects.toThrow(Forbidden)
    const unchanged = await payload.findByID({ collection, id: row.id, depth: 0 })
    expect(unchanged.title).toBe('Mine')
  })
})
