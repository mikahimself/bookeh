import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { getEffectiveBooks } from '@/lib/books/effectiveBook'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import { type BookEdits, editBook } from '@/lib/catalogue/editBook'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, Genre, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `editBook()`, AD-5/AD-6 (D5): on a shared Book both the admin and B hold,
// the admin's edit writes the Book and the user's becomes their overrides, so
// B sees the admin's edit and the admin never sees B's. Rejected edits write
// nothing.

describe('editBook', () => {
  let payload: Payload
  let admin: User
  let a: User
  let b: User
  let asAdmin: Context
  let asA: Context
  let asB: Context
  let asC: Context
  let genre: Genre

  /** A system write, as `lib/catalogue` makes it, with `user` on the request. */
  const systemBook = async (user: User, visibility: Book['visibility']) =>
    payload.create({
      collection: 'books',
      data: {
        title: 'Kalevala',
        subtitle: 'Suomen kansalliseepos',
        publisher: 'SKS',
        isbn13: randomIsbn(),
        visibility,
      },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const holdCopy = async (ctx: Context, book: Book) => {
    // `owner` only satisfies the create type.
    await gateway.create(ctx, {
      collection: 'copies',
      data: { owner: ctx.user.id, book: book.id, status: 'owned' },
      depth: 0,
    })
  }

  /** Shared X, held by the admin and B; the admin overrides its title and language. */
  const sharedX = async () => {
    const x = await systemBook(admin, 'shared')
    await holdCopy(asAdmin, x)
    await holdCopy(asB, x)
    await upsertUserBook(asAdmin, x.id, {
      overrides: { title: 'Kalevala (oma)', language: 'en' },
    })
    return x
  }

  const seen = async (ctx: Context, book: Book) =>
    (await getEffectiveBooks(ctx, [book.id])).get(book.id)

  beforeAll(async () => {
    payload = await getPayload({ config })
    admin = await createUser({ displayName: 'Edit Admin', roles: ['admin', 'user'] })
    b = await createUser({ displayName: 'Edit User B' })
    asAdmin = await contextFor(admin)
    a = await createUser({ displayName: 'Edit User A' })
    asA = await contextFor(a)
    asB = await contextFor(b)
    asC = await contextFor(await createUser({ displayName: 'Edit User C' }))
    genre = await payload.create({
      collection: 'genres',
      data: { name: `History ${randomUUID().slice(0, 8)}`, nameKey: '' },
      overrideAccess: true,
      depth: 0,
    })
  })

  it("writes the admin's edit to the shared Book and drops the admin's override", async () => {
    const x = await sharedX()
    await expect(
      editBook(asAdmin, {
        bookId: x.id,
        edits: { title: ' Kalevala, uusi laitos ', subtitle: '', genres: [genre.id, genre.id] },
      }),
    ).resolves.toBeUndefined()

    const expected = {
      title: 'Kalevala, uusi laitos',
      subtitle: null,
      genres: [{ id: genre.id, name: genre.name }],
      publisher: 'SKS',
    }
    expect(await seen(asAdmin, x)).toMatchObject({ ...expected, overridden: ['language'] })
    expect(await seen(asB, x)).toMatchObject({ ...expected, overridden: [] })
  })

  it("makes a user's edit their overrides and leaves the shared Book unchanged", async () => {
    const x = await sharedX()
    await editBook(asB, { bookId: x.id, edits: { title: ' Kalevala (B) ', subtitle: null } })

    expect(await seen(asB, x)).toMatchObject({
      title: 'Kalevala (B)',
      subtitle: null,
      publisher: 'SKS',
      overridden: ['title', 'subtitle'],
    })
    expect(await seen(asAdmin, x)).toMatchObject({
      title: 'Kalevala (oma)',
      subtitle: 'Suomen kansalliseepos',
      overridden: ['title', 'language'],
    })

    // The admin's later edit of the same field leaves B's override alone.
    await editBook(asAdmin, { bookId: x.id, edits: { title: 'Kalevala, uusi laitos' } })
    expect(await seen(asB, x)).toMatchObject({ title: 'Kalevala (B)' })
    expect(await seen(asAdmin, x)).toMatchObject({ title: 'Kalevala, uusi laitos' })
  })

  it('rejects genres from a user, themes, a cleared title, a non-holder and a private Book', async () => {
    const x = await sharedX()
    const before = [await seen(asAdmin, x), await seen(asB, x)]
    /** Fails with `VALIDATION` naming exactly `keys`. */
    const rejectsNaming = async (call: Promise<void>, ...keys: string[]) => {
      const err = await call.then(
        () => undefined,
        (error: unknown) => error,
      )
      expect(err).toMatchObject({ code: 'VALIDATION' })
      expect(err).toHaveProperty(
        'fields',
        Object.fromEntries(keys.map((key) => [key, 'VALIDATION'])),
      )
    }
    // Keys outside `BookEdits`, as a client could send them.
    const untyped = (edits: Record<string, unknown>) => edits as BookEdits

    await rejectsNaming(
      editBook(asB, { bookId: x.id, edits: { title: 'B', genres: [genre.id] } }),
      'genres',
    )
    await rejectsNaming(
      editBook(asAdmin, { bookId: x.id, edits: untyped({ title: 'A', themes: ['myytit'] }) }),
      'themes',
    )
    await rejectsNaming(
      editBook(asAdmin, { bookId: x.id, edits: { title: '  ', subtitle: 'S' } }),
      'title',
    )
    await rejectsNaming(editBook(asB, { bookId: x.id, edits: untyped({ title: null }) }), 'title')
    await expect(editBook(asC, { bookId: x.id, edits: { title: 'C' } })).rejects.toMatchObject(
      new DomainError('NOT_FOUND'),
    )
    expect([await seen(asAdmin, x), await seen(asB, x)]).toEqual(before)

    const p = await systemBook(a, 'private')
    await holdCopy(asA, p)
    const own = await seen(asA, p)
    await rejectsNaming(
      editBook(asA, { bookId: p.id, edits: { title: 'P', publisher: null } }),
      'title',
      'publisher',
    )
    expect(await seen(asA, p)).toEqual(own)

    const q = await systemBook(admin, 'private')
    await holdCopy(asAdmin, q)
    const admins = await seen(asAdmin, q)
    await rejectsNaming(
      editBook(asAdmin, { bookId: q.id, edits: { title: 'Q', genres: [genre.id] } }),
      'title',
      'genres',
    )
    expect(await seen(asAdmin, q)).toEqual(admins)
  })
})
