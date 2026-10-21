import { randomUUID } from 'node:crypto'

import { getPayload, NotFound, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { getEffectiveBooks } from '@/lib/books/effectiveBook'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import { type BookEdits, editBook } from '@/lib/catalogue/editBook'
import { findOrCreateByName } from '@/lib/catalogue/findOrCreateByName'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Author, Book, Genre, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `editBook()`, AD-5/AD-6 (D5): on a shared Book both the admin and B hold,
// the admin's edit writes the Book and the user's becomes their overrides, so
// B sees the admin's edit and the admin never sees B's. Author and series
// names match or are created in the editor's scope (shared for the admin,
// private for anyone else). Rejected edits write nothing, no name included.

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
  let s: Author

  const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

  /** Rows of `collection` with one of `names`, read with system privileges. */
  const named = async (collection: 'authors' | 'series', names: string[]) =>
    (
      await payload.find({
        collection,
        where: { name: { in: names } },
        overrideAccess: true,
        depth: 0,
      })
    ).docs

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
    s = await payload.create({
      collection: 'authors',
      data: { name: unique('Elias Lönnrot'), nameKey: '', visibility: 'shared' },
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

  it("resolves the admin's author and series names among shared records only", async () => {
    const x = await sharedX()
    const n = unique('Aino Kallas')
    const privateN = await findOrCreateByName(asAdmin, 'authors', 'private', { name: n })
    await upsertUserBook(asAdmin, x.id, { overrides: { authors: [privateN.id] } })
    const seriesName = unique('Uusi sarja')

    await editBook(asAdmin, {
      bookId: x.id,
      edits: { authors: [s.name.toUpperCase(), n, s.name], series: seriesName },
    })

    const [sharedN] = await named('authors', [n]).then((rows) =>
      rows.filter((row) => row.visibility === 'shared'),
    )
    const [series] = await named('series', [seriesName])
    if (sharedN === undefined || series === undefined) throw new Error('N or the series is missing')
    expect(sharedN.id).not.toBe(privateN.id)
    expect(series.visibility).toBe('shared')
    const expected = {
      authors: [
        { id: s.id, name: s.name },
        { id: sharedN.id, name: n },
      ],
      series: { id: series.id, name: seriesName },
    }
    expect(await seen(asAdmin, x)).toMatchObject({ ...expected, overridden: ['title', 'language'] })
    expect(await seen(asB, x)).toMatchObject({ ...expected, overridden: [] })
  })

  it("stores a user's author and series names as their private override", async () => {
    const x = await sharedX()
    const old = await findOrCreateByName(asAdmin, 'series', 'shared', {
      name: unique('Kansalliskirjasto'),
    })
    await payload.update({
      collection: 'books',
      id: x.id,
      data: { authors: [s.id], series: old.id },
      overrideAccess: true,
      depth: 0,
    })
    const pName = unique('B Kirjoittaja')

    await editBook(asB, { bookId: x.id, edits: { authors: [s.name, pName, s.name], series: null } })

    const [p] = await named('authors', [pName])
    expect(p).toMatchObject({ visibility: 'private', createdBy: b.id })
    expect(await seen(asB, x)).toMatchObject({
      authors: [
        { id: s.id, name: s.name },
        { id: p?.id, name: pName },
      ],
      series: null,
      overridden: ['authors', 'series'],
    })
    expect(await seen(asAdmin, x)).toMatchObject({
      authors: [{ id: s.id, name: s.name }],
      series: { id: old.id },
      overridden: ['title', 'language'],
    })
    await expect(gateway.findByID(asA, { collection: 'authors', id: p?.id ?? 0 })).rejects.toThrow(
      NotFound,
    )
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
    const ghosts = [unique('Ghost A'), unique('Ghost B'), unique('Ghost C')]
    const ghostSeries = unique('Ghost Series')

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
    await rejectsNaming(
      editBook(asB, { bookId: x.id, edits: { authors: [ghosts[0] ?? '', '  '] } }),
      'authors',
    )
    await expect(
      editBook(asC, {
        bookId: x.id,
        edits: { title: 'C', authors: [ghosts[1] ?? ''], series: ghostSeries },
      }),
    ).rejects.toMatchObject(new DomainError('NOT_FOUND'))
    expect([await seen(asAdmin, x), await seen(asB, x)]).toEqual(before)

    const p = await systemBook(a, 'private')
    await holdCopy(asA, p)
    const own = await seen(asA, p)
    await rejectsNaming(
      editBook(asA, {
        bookId: p.id,
        edits: { title: 'P', authors: [ghosts[2] ?? ''], series: ghostSeries, publisher: null },
      }),
      'title',
      'authors',
      'series',
      'publisher',
    )
    expect(await seen(asA, p)).toEqual(own)
    expect([
      ...(await named('authors', ghosts)),
      ...(await named('series', [ghostSeries])),
    ]).toEqual([])

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
