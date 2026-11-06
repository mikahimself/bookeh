import { createLocalReq, Forbidden, getPayload, NotFound, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { helsinkiToday } from '@/fields/readingDates'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, Copy, User } from '@/payload-types'

import { copyAs, ownerId } from '../helpers/builders'
import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'
import { rejectedPaths } from '../helpers/validation'

// `copies`, AD-1/AD-8/AD-17: owner from the request, owner-scoped access that
// binds the admin too, a `book` that must be readable by the request user and
// the two-value `status`. This file tests the collection directly, writing
// through the gateway as a user; services create copies through `createCopy()`.

describe('copies', () => {
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

  const systemRead = (id: number) => payload.findByID({ collection: 'copies', id, depth: 0 })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Copies User A' })
    b = await createUser({ displayName: 'Copies User B' })
    admin = await createUser({ displayName: 'Copies Admin', roles: ['admin'] })
    shared = await systemBook(a, 'shared')
  })

  it('saves a copy for the request user, whatever owner the input names', async () => {
    const copy = await copyAs(a, { book: shared.id, owner: b.id, notes: 'Signed' })
    expect(ownerId(copy)).toBe(a.id)
    expect(copy.book).toBe(shared.id)
    expect(copy.status).toBe('owned')
    expect(copy.notes).toBe('Signed')

    const asA = await contextFor(a)
    expect((await gateway.findByID(asA, { collection: 'copies', id: copy.id })).id).toBe(copy.id)
    const found = await gateway.find(asA, {
      collection: 'copies',
      where: { id: { equals: copy.id } },
    })
    expect(found.docs.map((doc) => doc.id)).toEqual([copy.id])
  })

  it("accepts a shared Book and the user's own private Book, rejects another user's", async () => {
    expect(ownerId(await copyAs(b, { book: shared.id }))).toBe(b.id)
    const privateBook = await systemBook(a, 'private')
    await expect(copyAs(a, { book: privateBook.id })).resolves.toBeDefined()
    expect(await rejectedPaths(copyAs(b, { book: privateBook.id }))).toEqual(['book'])
    const { totalDocs } = await payload.count({
      collection: 'copies',
      where: { and: [{ book: { equals: privateBook.id } }, { owner: { equals: b.id } }] },
    })
    expect(totalDocs).toBe(0)
  })

  it('hides a copy from another user and from the admin alike', async () => {
    const copy = await copyAs(a, { book: shared.id })
    for (const user of [b, admin]) {
      const ctx = await contextFor(user)
      const seen = await gateway.find(ctx, {
        collection: 'copies',
        where: { id: { in: [copy.id] } },
      })
      expect(seen.docs).toEqual([])
      await expect(gateway.findByID(ctx, { collection: 'copies', id: copy.id })).rejects.toThrow(
        NotFound,
      )
    }
  })

  it("refuses another user's writes and leaves the row as it was", async () => {
    const copy = await copyAs(a, { book: shared.id, notes: 'Mine' })
    const asB = await contextFor(b)
    // Unlike reads, Payload's by-ID writes answer Forbidden, not NotFound,
    // when a `where` access policy hides the row.
    await expect(
      gateway.updateByID(asB, { collection: 'copies', id: copy.id, data: { notes: 'Hijacked' } }),
    ).rejects.toThrow(Forbidden)
    await expect(gateway.deleteByID(asB, { collection: 'copies', id: copy.id })).rejects.toThrow(
      Forbidden,
    )
    const unchanged = await systemRead(copy.id)
    expect(unchanged.notes).toBe('Mine')
    expect(ownerId(unchanged)).toBe(a.id)
  })

  it('lets the owner edit and delete', async () => {
    const copy = await copyAs(a, { book: shared.id })
    const asA = await contextFor(a)
    const updated = await gateway.updateByID(asA, {
      collection: 'copies',
      id: copy.id,
      data: { status: 'ordered' },
    })
    expect(updated.status).toBe('ordered')
    await gateway.deleteByID(asA, { collection: 'copies', id: copy.id })
    await expect(systemRead(copy.id)).rejects.toThrow(NotFound)
  })

  it('lets a signed-out request read nothing', async () => {
    const copy = await copyAs(a, { book: shared.id })
    await expect(
      payload.find({
        collection: 'copies',
        where: { id: { equals: copy.id } },
        req: await createLocalReq({}, payload),
        user: null,
        overrideAccess: false,
      }),
    ).rejects.toThrow(Forbidden)
  })

  it('refuses a create without a user', async () => {
    const req = await createLocalReq({}, payload)
    await expect(
      payload.create({
        collection: 'copies',
        data: {
          owner: a.id,
          acquiredAt: '2026-01-01T12:00:00.000Z',
          book: shared.id,
          status: 'owned',
        },
        req,
        overrideAccess: false,
      }),
    ).rejects.toThrow(Forbidden)
  })

  it('rejects a status outside ordered | owned', async () => {
    const status = 'loaned' as Copy['status']
    expect(await rejectedPaths(copyAs(a, { book: shared.id, status }))).toEqual(['status'])
  })

  // Spine, Dates and FR-55: the collection holds the purchase rules for back-office writes too.
  it('rejects a bad acquired date or price on create and update', async () => {
    const tomorrow = new Date(Date.parse(`${helsinkiToday()}T12:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10)
    const copy = await copyAs(a, { book: shared.id })
    const asA = await contextFor(a)
    const cases: [Partial<Copy>, string][] = [
      [{ acquiredAt: tomorrow }, 'acquiredAt'],
      [{ acquiredAt: '2026-02-30' }, 'acquiredAt'],
      [{ price: 1.5 }, 'price'],
      [{ price: -1 }, 'price'],
      [{ price: 10_000_000 }, 'price'],
    ]
    for (const [data, path] of cases) {
      expect(await rejectedPaths(copyAs(a, { book: shared.id, ...data }))).toEqual([path])
      expect(
        await rejectedPaths(gateway.updateByID(asA, { collection: 'copies', id: copy.id, data })),
      ).toEqual([path])
    }
  })
})
