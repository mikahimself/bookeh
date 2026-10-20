import { getPayload, NotFound, type Payload, type Where } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { createCopy } from '@/lib/copies/createCopy'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { withTransaction } from '@/lib/payload/transaction'
import config from '@/payload.config'
import type { Book, Copy, User, UserLocation } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'
import { rejectedPaths } from '../helpers/validation'

// `createCopy()`, AD-18: the one insert into `copies` writes an owned or
// ordered copy for the context's user, leaves a Book the user cannot read to
// the collection's `readableRelation`, and joins the caller's transaction.
// FR-4/FR-31: an owned copy lands at the profile's default location unless
// the input names one (an id or a name to create) or `null`; an ordered copy
// has none. User A has no default; the location rows use users of their own.

describe('createCopy', () => {
  let payload: Payload
  let a: User
  let b: User
  let asA: Context
  let shared: Book

  /** A Book as `lib/catalogue` creates it, with a fresh ISBN. */
  const bookFor = async (user: User, visibility: Book['visibility']) =>
    payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const systemRead = (id: number) => payload.findByID({ collection: 'copies', id, depth: 0 })

  const copiesOf = async (user: User, book: Book) =>
    (
      await payload.count({
        collection: 'copies',
        where: { and: [{ owner: { equals: user.id } }, { book: { equals: book.id } }] },
      })
    ).totalDocs

  const expectCopy = (copy: Copy, user: User, book: Book, status: Copy['status']) => {
    expect(copy).toMatchObject({ owner: user.id, book: book.id, status })
    expect(copy.location ?? null).toBeNull()
    expect(copy.notes ?? null).toBeNull()
  }

  /** A location created by `user` through Payload's owner access. */
  const locationFor = async (user: User, name: string): Promise<UserLocation> =>
    payload.create({
      collection: 'locations',
      data: { owner: user.id, name, nameKey: '' },
      overrideAccess: false,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  /** A fresh user whose profile default is a new location, and its context. */
  const userWithDefault = async () => {
    const user = await createUser({ displayName: 'Create Copy Default User' })
    const location = await locationFor(user, 'Olohuone')
    const updated = await payload.update({
      collection: 'users',
      id: user.id,
      data: { defaultLocation: location.id },
      overrideAccess: true,
    })
    return { user: updated, location, ctx: await contextFor(updated) }
  }

  const locationsOf = async (user: User, where: Where = {}) =>
    (
      await payload.count({
        collection: 'locations',
        where: { and: [{ owner: { equals: user.id } }, where] },
      })
    ).totalDocs

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Create Copy User A' })
    b = await createUser({ displayName: 'Create Copy User B' })
    asA = await contextFor(a)
    shared = await bookFor(a, 'shared')
  })

  it('creates an owned copy for the context user', async () => {
    const { data: id } = await createCopy(asA, { bookId: shared.id, status: 'owned' })
    expectCopy(await systemRead(id), a, shared, 'owned')
  })

  it('creates an ordered copy', async () => {
    const { data: id } = await createCopy(asA, { bookId: shared.id, status: 'ordered' })
    expectCopy(await systemRead(id), a, shared, 'ordered')
  })

  it("adds a second copy of the user's own private Book", async () => {
    const book = await bookFor(a, 'private')
    const { data: first } = await createCopy(asA, { bookId: book.id, status: 'owned' })
    const { data: second } = await createCopy(asA, { bookId: book.id, status: 'owned' })
    expect(second).not.toBe(first)
    expectCopy(await systemRead(first), a, book, 'owned')
    expectCopy(await systemRead(second), a, book, 'owned')
    expect(await copiesOf(a, book)).toBe(2)
  })

  it("refuses another user's private Book on `book`", async () => {
    const book = await bookFor(a, 'private')
    const asB = await contextFor(b)
    expect(await rejectedPaths(createCopy(asB, { bookId: book.id, status: 'owned' }))).toEqual([
      'book',
    ])
    expect(await copiesOf(b, book)).toBe(0)
  })

  it('leaves nothing behind when the transaction rolls back', async () => {
    const failure = new Error('after the copy')
    let seen: number | undefined
    await expect(
      withTransaction(asA, (tx) =>
        createCopy(tx, { bookId: shared.id, status: 'owned' }).then(({ data: id }) => {
          seen = id
          throw failure
        }),
      ),
    ).rejects.toBe(failure)
    expect(seen).toBeTypeOf('number')
    await expect(systemRead(seen as number)).rejects.toThrow(NotFound)
  })

  it("places an owned copy at the user's default location", async () => {
    const { ctx, location } = await userWithDefault()
    const { data: id } = await createCopy(ctx, { bookId: shared.id, status: 'owned' })
    expect((await systemRead(id)).location).toBe(location.id)
  })

  it('leaves an owned copy without a location when the user has no default', async () => {
    const user = await createUser({ displayName: 'Create Copy No Default' })
    const { data: id } = await createCopy(await contextFor(user), {
      bookId: shared.id,
      status: 'owned',
    })
    expectCopy(await systemRead(id), user, shared, 'owned')
  })

  it('places no location on `location: null` despite a default', async () => {
    const { ctx, user } = await userWithDefault()
    const { data: id } = await createCopy(ctx, {
      bookId: shared.id,
      status: 'owned',
      location: null,
    })
    expectCopy(await systemRead(id), user, shared, 'owned')
  })

  it('places no location on an ordered copy despite a default', async () => {
    const { ctx, user } = await userWithDefault()
    const { data: id } = await createCopy(ctx, { bookId: shared.id, status: 'ordered' })
    expectCopy(await systemRead(id), user, shared, 'ordered')
  })

  it('places an owned copy at a location given by id over the default', async () => {
    const { ctx, user } = await userWithDefault()
    const second = await locationFor(user, 'Mökki')
    const { data: id } = await createCopy(ctx, {
      bookId: shared.id,
      status: 'owned',
      location: second.id,
    })
    expect((await systemRead(id)).location).toBe(second.id)
  })

  it('creates a named location inline and places the copy there', async () => {
    const user = await createUser({ displayName: 'Create Copy Inline' })
    const { data: id } = await createCopy(await contextFor(user), {
      bookId: shared.id,
      status: 'owned',
      location: { create: '  Mökki ' },
    })
    const { docs } = await payload.find({
      collection: 'locations',
      where: { owner: { equals: user.id } },
      depth: 0,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ name: 'Mökki', owner: user.id })
    expect((await systemRead(id)).location).toBe(docs[0]?.id)
  })

  it('matches an existing location by name, case-insensitively', async () => {
    const user = await createUser({ displayName: 'Create Copy Match' })
    const existing = await locationFor(user, 'Mökki')
    const { data: id } = await createCopy(await contextFor(user), {
      bookId: shared.id,
      status: 'owned',
      location: { create: 'MÖKKI' },
    })
    expect((await systemRead(id)).location).toBe(existing.id)
    expect(await locationsOf(user)).toBe(1)
  })

  it('rejects a blank location name before writing anything', async () => {
    const user = await createUser({ displayName: 'Create Copy Blank' })
    const err: unknown = await createCopy(await contextFor(user), {
      bookId: shared.id,
      status: 'owned',
      location: { create: '   ' },
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DomainError)
    expect(err).toMatchObject({ code: 'VALIDATION', fields: { location: 'VALIDATION' } })
    expect(await copiesOf(user, shared)).toBe(0)
    expect(await locationsOf(user)).toBe(0)
  })

  it('rolls back an inline-created location when the insert fails', async () => {
    const book = await bookFor(a, 'private')
    const name = `Varasto ${randomIsbn()}`
    expect(
      await rejectedPaths(
        createCopy(await contextFor(b), {
          bookId: book.id,
          status: 'owned',
          location: { create: name },
        }),
      ),
    ).toEqual(['book'])
    expect(await locationsOf(b, { name: { equals: name } })).toBe(0)
  })
})
