import { randomUUID } from 'node:crypto'

import { getPayload, NotFound, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { savedCopy } from '@/app/(frontend)/books/[bookId]/edit/savedCopy'
import { getEffectiveBooks } from '@/lib/books/effectiveBook'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import { type BookEdits, editBook } from '@/lib/catalogue/editBook'
import { findOrCreateByName } from '@/lib/catalogue/findOrCreateByName'
import { resolveLocation } from '@/lib/copies/locations'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Author, Book, Genre, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { hyphenatedIsbn10, randomIsbn } from '../helpers/isbn'

// `editBook()`, AD-5/AD-6 (D5): on a shared Book both the admin and B hold,
// the admin's edit writes the Book and the user's becomes their overrides, so
// B sees the admin's edit and the admin never sees B's. Author and series
// names match or are created in the editor's scope (shared for the admin,
// private for anyone else). On a private Book only its creator edits, the
// edit is the Book's own and names resolve privately. Rejected edits write
// nothing, no name included.

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

  const holdCopy = async (ctx: Context, book: Book, location?: number) =>
    // `owner` only satisfies the create type.
    gateway.create(ctx, {
      collection: 'copies',
      data: { owner: ctx.user.id, book: book.id, status: 'owned', location },
      depth: 0,
    })

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

  /** Fails with `VALIDATION` naming exactly `keys`, each with `code`. */
  const rejectsNaming = async (
    call: Promise<void>,
    keys: string[],
    code: 'VALIDATION' | 'INVALID_ISBN' = 'VALIDATION',
  ) => {
    const err = await call.then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(err).toMatchObject({ code: 'VALIDATION' })
    expect(err).toHaveProperty('fields', Object.fromEntries(keys.map((key) => [key, code])))
  }
  // Keys and values outside `BookEdits`, as a client could send them.
  const untyped = (edits: Record<string, unknown>) => edits as BookEdits

  it('rejects genres from a user, themes, a cleared title, an ISBN and a non-holder', async () => {
    const x = await sharedX()
    const before = [await seen(asAdmin, x), await seen(asB, x)]
    const ghosts = [unique('Ghost A'), unique('Ghost B')]
    const ghostSeries = unique('Ghost Series')

    await rejectsNaming(
      editBook(asB, { bookId: x.id, edits: { title: 'B', genres: [genre.id] } }),
      ['genres'],
    )
    await rejectsNaming(
      editBook(asAdmin, { bookId: x.id, edits: untyped({ title: 'A', themes: ['myytit'] }) }),
      ['themes'],
    )
    await rejectsNaming(
      editBook(asAdmin, { bookId: x.id, edits: { title: '  ', subtitle: 'S' } }),
      ['title'],
    )
    await rejectsNaming(editBook(asB, { bookId: x.id, edits: untyped({ title: null }) }), ['title'])
    await rejectsNaming(
      editBook(asB, { bookId: x.id, edits: { authors: [ghosts[0] ?? '', '  '] } }),
      ['authors'],
    )
    await rejectsNaming(
      editBook(asAdmin, { bookId: x.id, edits: { title: 'A', isbn13: randomIsbn() } }),
      ['isbn13'],
    )
    await expect(
      editBook(asC, {
        bookId: x.id,
        edits: { title: 'C', authors: [ghosts[1] ?? ''], series: ghostSeries },
      }),
    ).rejects.toMatchObject(new DomainError('NOT_FOUND'))
    expect([await seen(asAdmin, x), await seen(asB, x)]).toEqual(before)

    expect([
      ...(await named('authors', ghosts)),
      ...(await named('series', [ghostSeries])),
    ]).toEqual([])
  })

  // Story 4.9, FR-13/FR-28: the copy Edit book was opened for, in the Book edit's transaction.
  describe('with a copy', () => {
    const copyOf = async (ctx: Context, id: number) =>
      gateway.findByID(ctx, { collection: 'copies', id, depth: 0 })

    /** Shared X; B holds a copy of it at a location of B's. */
    const heldAt = async () => {
      const x = await systemBook(admin, 'shared')
      const location = await resolveLocation(asB, { create: unique('Tampere') })
      const copy = await holdCopy(asB, x, location)
      return { x, copy, location }
    }

    /** Shared X; `ctx`'s user holds an ordered copy of it. */
    const ordered = async (ctx: Context) => {
      const x = await systemBook(admin, 'shared')
      // `owner` only satisfies the create type.
      const copy = await gateway.create(ctx, {
        collection: 'copies',
        data: { owner: ctx.user.id, book: x.id, status: 'ordered' },
        depth: 0,
      })
      return { x, copy }
    }

    it('writes the title and marks the copy ordered, with no location', async () => {
      const { x, copy } = await heldAt()
      await editBook(asB, {
        bookId: x.id,
        edits: { title: 'Kalevala (B)' },
        copy: { id: copy.id, status: 'ordered' },
      })

      expect(await seen(asB, x)).toMatchObject({ title: 'Kalevala (B)' })
      expect(await copyOf(asB, copy.id)).toMatchObject({ status: 'ordered', location: null })
    })

    it('marks an ordered copy owned at the location shown', async () => {
      const { x, copy } = await ordered(asB)
      const location = await resolveLocation(asB, { create: unique('Tampere') })
      await editBook(asB, {
        bookId: x.id,
        edits: {},
        copy: { id: copy.id, status: 'owned', location },
      })

      expect(await copyOf(asB, copy.id)).toMatchObject({ status: 'owned', location })
    })

    it('moves an owned copy to a location created by name', async () => {
      const { x, copy, location } = await heldAt()
      const name = unique('Mökki')
      await editBook(asB, {
        bookId: x.id,
        edits: {},
        copy: { id: copy.id, location: { create: name } },
      })

      const moved = await copyOf(asB, copy.id)
      expect(moved.status).toBe('owned')
      expect(moved.location).not.toBe(location)
      expect(moved.location).toBe(await resolveLocation(asB, { create: name }))
    })

    it('writes nothing when the copy is refused, the Book edit included', async () => {
      const { x, copy, location } = await heldAt()
      const before = await seen(asB, x)

      await rejectsNaming(
        editBook(asB, {
          bookId: x.id,
          edits: { title: 'X' },
          copy: { id: copy.id, status: 'ordered', location },
        }),
        ['location'],
      )
      // Refused after the Book's write: another user's copy.
      const other = await holdCopy(asAdmin, x)
      await expect(
        editBook(asB, {
          bookId: x.id,
          edits: { title: 'X' },
          copy: { id: other.id, status: 'ordered' },
        }),
      ).rejects.toMatchObject(new DomainError('NOT_FOUND'))

      expect(await seen(asB, x)).toEqual(before)
      expect(await copyOf(asB, copy.id)).toMatchObject({ status: 'owned', location })
    })

    it("shows Edit book only the viewer's own copy of this Book (`?copy=`)", async () => {
      const { x, copy, location } = await heldAt()
      const other = await holdCopy(asAdmin, x)
      const elsewhere = await holdCopy(asB, await systemBook(admin, 'shared'))

      expect(await savedCopy(asB, x.id, String(copy.id))).toEqual({
        id: copy.id,
        status: 'owned',
        location,
      })
      for (const param of [String(other.id), String(elsewhere.id), `${copy.id}x`, undefined]) {
        expect(await savedCopy(asB, x.id, param)).toBeNull()
      }
    })

    it('starts an ordered copy at the default location, what owned would give it', async () => {
      const d = await createUser({ displayName: 'Edit User D' })
      const home = await resolveLocation(await contextFor(d), { create: unique('Koti') })
      const asD = await contextFor(
        await payload.update({
          collection: 'users',
          id: d.id,
          data: { defaultLocation: home },
          overrideAccess: true,
          depth: 0,
        }),
      )
      const { x, copy } = await ordered(asD)

      expect(await savedCopy(asD, x.id, String(copy.id))).toEqual({
        id: copy.id,
        status: 'ordered',
        location: home,
      })
    })
  })

  // Story 4.4, FR-14/AD-5: a private Book's creator edits the Book itself.
  describe('on a private Book', () => {
    /** `user`'s private Book, held by them. */
    const privateBook = async (user: User, ctx: Context) => {
      const p = await systemBook(user, 'private')
      await holdCopy(ctx, p)
      return p
    }

    it("writes the creator's edit to the Book itself, with no override", async () => {
      const p = await privateBook(a, asA)
      const isbn13 = randomIsbn()
      const pName = unique('A Kirjoittaja')
      await expect(
        editBook(asA, {
          bookId: p.id,
          edits: {
            title: ' P2 ',
            authors: [s.name, pName],
            publisher: null,
            genres: [genre.id, genre.id],
            isbn13: hyphenatedIsbn10(isbn13),
          },
        }),
      ).resolves.toBeUndefined()

      const [author] = await named('authors', [pName])
      expect(author).toMatchObject({ visibility: 'private', createdBy: a.id })
      expect(await seen(asA, p)).toMatchObject({
        title: 'P2',
        subtitle: 'Suomen kansalliseepos',
        authors: [
          { id: s.id, name: s.name },
          { id: author?.id, name: pName },
        ],
        publisher: null,
        genres: [{ id: genre.id, name: genre.name }],
        isbn13,
        overridden: [],
      })
      const { totalDocs } = await payload.count({
        collection: 'user-books',
        where: { book: { equals: p.id } },
        overrideAccess: true,
      })
      expect(totalDocs).toBe(0)
    })

    it("resolves the admin's names privately on the admin's own private Book", async () => {
      const q = await privateBook(admin, asAdmin)
      const qName = unique('Q Kirjoittaja')
      await editBook(asAdmin, { bookId: q.id, edits: { authors: [qName] } })

      const [author] = await named('authors', [qName])
      expect(author).toMatchObject({ visibility: 'private', createdBy: admin.id })
      expect(await seen(asAdmin, q)).toMatchObject({ authors: [{ id: author?.id, name: qName }] })
    })

    it('rejects a clashing or invalid ISBN and an edit by anyone but the creator', async () => {
      const p1 = await privateBook(a, asA)
      const p = await privateBook(a, asA)
      const before = await seen(asA, p)
      const ghost = unique('Ghost P')

      // The names resolve before the write fails; the rollback removes them.
      await rejectsNaming(
        editBook(asA, {
          bookId: p.id,
          edits: { title: 'P3', authors: [ghost], isbn13: p1.isbn13! },
        }),
        ['isbn13'],
      )
      await rejectsNaming(
        editBook(asA, { bookId: p.id, edits: { isbn13: 'abc' } }),
        ['isbn13'],
        'INVALID_ISBN',
      )
      await rejectsNaming(
        editBook(asA, { bookId: p.id, edits: { isbn13: '' } }),
        ['isbn13'],
        'INVALID_ISBN',
      )
      // An ISBN is never removed.
      await rejectsNaming(
        editBook(asA, { bookId: p.id, edits: untyped({ isbn13: null }) }),
        ['isbn13'],
        'INVALID_ISBN',
      )

      // The admin can read and hold A's private Book, but not edit it.
      await holdCopy(asAdmin, p)
      await expect(
        editBook(asAdmin, { bookId: p.id, edits: { title: 'Q' } }),
      ).rejects.toMatchObject(new DomainError('NOT_FOUND'))

      expect(await seen(asA, p)).toEqual(before)
      expect(await named('authors', [ghost])).toEqual([])
    })
  })
})
