import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { upsertUserBook } from '@/lib/books/upsertUserBook'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import type { ShelfQuery } from '@/lib/shelf/query'
import { shelfIds } from '@/lib/shelf/shelfIds'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `shelfIds()`, AD-7: the viewer's copies only (two-user access test), in
// Finnish title order with overrides applied, no year (or a cleared one) last
// both ways, and by first effective author's sort name, no author last.
// Each test has its own users; owner scoping keeps them apart. Shared name
// keys are unique and rows stay, so author names carry a per-run suffix.

const ALL = { offset: 0, limit: 50 }

describe('shelfIds', () => {
  let payload: Payload

  /** A shared Book, as `lib/catalogue` writes it. */
  const sharedBook = async (by: User, data: Partial<Book> = {}) =>
    payload.create({
      collection: 'books',
      data: { title: 'Kirja', isbn13: randomIsbn(), visibility: 'shared', ...data },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(by)).req,
    })

  /** A copy owned by `user`; `owner` only satisfies the create type. */
  const copyOf = async (user: User, book: Book) =>
    (
      await gateway.create(await contextFor(user), {
        collection: 'copies',
        data: { owner: user.id, book: book.id, status: 'owned' },
        depth: 0,
      })
    ).id

  /** A shared author with an explicit sort name; the name only has to be unique. */
  const author = async (by: User, sortName: string) =>
    (
      await payload.create({
        collection: 'authors',
        data: {
          name: `${sortName} ${randomUUID().slice(0, 8)}`,
          sortName,
          visibility: 'shared',
          nameKey: '',
        },
        overrideAccess: true,
        depth: 0,
        req: (await contextFor(by)).req,
      })
    ).id

  const copyIds = async (ctx: Context, sort: ShelfQuery['sort'], dir: ShelfQuery['dir']) =>
    (await shelfIds(ctx, { filters: {}, sort, dir }, ALL)).ids.map((id) => id.copyId)

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it("lists only the viewer's copies and counts only them", async () => {
    const a = await createUser({ displayName: 'Shelf A' })
    const b = await createUser({ displayName: 'Shelf B' })
    const x = await sharedBook(a)
    const y = await sharedBook(b)
    const p = await sharedBook(a, { title: 'Oma', visibility: 'private' })
    const firstOfX = await copyOf(a, x)
    const secondOfX = await copyOf(a, x)
    const ownP = await copyOf(a, p)
    await copyOf(b, x)
    await copyOf(b, y)
    // B's override must not reach A's rows (AD-6: `user_books` joins on the viewer).
    await upsertUserBook(await contextFor(b), x.id, { overrides: { title: 'Öljy' } })
    const asA = await contextFor(a)

    const seen = await shelfIds(asA, { filters: {}, sort: 'title', dir: 'asc' }, ALL)
    expect(seen).toEqual({
      ids: [
        { copyId: firstOfX, bookId: x.id },
        { copyId: secondOfX, bookId: x.id },
        { copyId: ownP, bookId: p.id },
      ],
      total: 3,
    })
    const desc = await shelfIds(asA, { filters: {}, sort: 'title', dir: 'desc' }, ALL)
    expect(desc.ids.map((id) => id.copyId)).toEqual([ownP, secondOfX, firstOfX])

    const page = { filters: {}, sort: 'added', dir: 'asc' } as const
    expect(await shelfIds(asA, page, { offset: 1, limit: 1 })).toEqual({
      ids: [{ copyId: secondOfX, bookId: x.id }],
      total: 3,
    })
    expect(await shelfIds(asA, page, { offset: 3, limit: 50 })).toEqual({ ids: [], total: 3 })
  })

  it('sorts titles in Finnish order, an overridden title by its override', async () => {
    const a = await createUser({ displayName: 'Shelf Titles' })
    const asA = await contextFor(a)
    const orkki = await copyOf(a, await sharedBook(a, { title: 'Örkki' }))
    const aapinen = await sharedBook(a, { title: 'Aapinen' })
    const oopinen = await copyOf(a, aapinen)
    await upsertUserBook(asA, aapinen.id, { overrides: { title: 'Ööpinen' } })
    const zorro = await copyOf(a, await sharedBook(a, { title: 'Zorro' }))
    // Byte order (C collation) puts Ä before Å; Finnish puts Å first.
    const arra = await copyOf(a, await sharedBook(a, { title: 'Ärrä' }))
    const ake = await copyOf(a, await sharedBook(a, { title: 'Åke' }))

    expect(await copyIds(asA, 'title', 'asc')).toEqual([zorro, ake, arra, orkki, oopinen])
  })

  it('puts Books with no year last in both directions', async () => {
    const a = await createUser({ displayName: 'Shelf Years' })
    const asA = await contextFor(a)
    const none = await copyOf(a, await sharedBook(a))
    const y2005 = await copyOf(a, await sharedBook(a, { year: 2005 }))
    const y1990 = await copyOf(a, await sharedBook(a, { year: 1990 }))
    const book1980 = await sharedBook(a, { year: 1980 })
    const cleared = await copyOf(a, book1980)
    await upsertUserBook(asA, book1980.id, { overrides: { year: null } })

    expect(await copyIds(asA, 'year', 'asc')).toEqual([y1990, y2005, none, cleared])
    expect(await copyIds(asA, 'year', 'desc')).toEqual([y2005, y1990, cleared, none])
  })

  it("sorts by the first effective author's sort name, then title; no author last", async () => {
    const a = await createUser({ displayName: 'Shelf Authors' })
    const asA = await contextFor(a)
    const jansson = await author(a, 'Jansson, Tove')
    const kivi = await author(a, 'Kivi, Aleksis')
    const topelius = await author(a, 'Topelius, Zacharias')
    const by = async (title: string, authors: number[]) =>
      copyOf(a, await sharedBook(a, { title, authors }))

    const muumi = await by('Muumi', [jansson])
    const seitseman = await by('Seitsemän veljestä', [kivi])
    const nummisuutarit = await by('Nummisuutarit', [kivi])
    const valskari = await by('Välskärin kertomuksia', [topelius, jansson])
    const orn = await by('Örn', [await author(a, 'Örn, Ari')])
    const zorn = await by('Zorn', [await author(a, 'Zorn, Ari')])
    const none = await by('Aapinen', [])
    const overriddenBook = await sharedBook(a, { title: 'Kirja', authors: [jansson] })
    const overridden = await copyOf(a, overriddenBook)
    await upsertUserBook(asA, overriddenBook.id, { overrides: { authors: [kivi] } })

    expect(await copyIds(asA, 'author', 'asc')).toEqual([
      muumi,
      overridden,
      nummisuutarit,
      seitseman,
      valskari,
      zorn,
      orn,
      none,
    ])
    expect(await copyIds(asA, 'author', 'desc')).toEqual([
      orn,
      zorn,
      valskari,
      seitseman,
      nummisuutarit,
      overridden,
      muumi,
      none,
    ])
  })
})
