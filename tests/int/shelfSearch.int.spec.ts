import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { upsertUserBook } from '@/lib/books/upsertUserBook'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { shelfIds } from '@/lib/shelf/shelfIds'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `shelfIds()` with `q` (FR-24, NFR-7): title, author, series, ISBN-13 and
// per-copy notes, case-insensitive without accent folding, `%` `_` `\`
// literal, overrides searched by the viewer's value only.
// Each test has its own users; owner scoping keeps them apart. Authors and
// series are shared, as a shared Book's must be (AD-4); the shared `nameKey`
// index is global and rows stay, so their names carry a per-run suffix.

const ALL = { offset: 0, limit: 50 }

describe('shelfIds text search', () => {
  let payload: Payload

  const reqFor = async (user: User) => (await contextFor(user)).req

  const sharedBook = async (by: User, data: Partial<Book> = {}) =>
    payload.create({
      collection: 'books',
      data: { title: 'Kirja', isbn13: randomIsbn(), visibility: 'shared', ...data },
      overrideAccess: true,
      depth: 0,
      req: await reqFor(by),
    })

  const sharedRecord = async (by: User, collection: 'authors' | 'series', name: string) =>
    (
      await payload.create({
        collection,
        data: { name: `${name} ${randomUUID().slice(0, 8)}`, visibility: 'shared', nameKey: '' },
        overrideAccess: true,
        depth: 0,
        req: await reqFor(by),
      })
    ).id

  const copyOf = async (user: User, book: Book, notes?: string) =>
    (
      await gateway.create(await contextFor(user), {
        collection: 'copies',
        data: { owner: user.id, book: book.id, status: 'owned', notes },
        depth: 0,
      })
    ).id

  /** Copy ids matching `q`, in copy id order, and the count. */
  const search = async (ctx: Context, q: string) => {
    const { ids, total } = await shelfIds(ctx, { q, filters: {}, sort: 'added', dir: 'asc' }, ALL)
    return { ids: ids.map((id) => id.copyId), total }
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('matches title, author substring, series, ISBN-13 and notes per copy', async () => {
    const a = await createUser({ displayName: 'Search Fields' })
    const asA = await contextFor(a)
    const kivi = await sharedRecord(a, 'authors', 'Aleksis Kivi')
    const muumit = await sharedRecord(a, 'series', 'Muumit')
    const byTitle = await copyOf(a, await sharedBook(a, { title: 'Seitsemän veljestä' }))
    const byAuthor = await copyOf(a, await sharedBook(a, { authors: [kivi] }))
    // A viewer row overriding another field leaves the Book's authors in force.
    const leino = await sharedRecord(a, 'authors', 'Eino Leino')
    const yearOnly = await sharedBook(a, { authors: [leino] })
    const byAuthorWithRow = await copyOf(a, yearOnly)
    await upsertUserBook(asA, yearOnly.id, { overrides: { year: 1900 } })
    const bySeries = await copyOf(a, await sharedBook(a, { series: muumit }))
    const isbnBook = await sharedBook(a)
    const byIsbn = await copyOf(a, isbnBook)
    const noted = await sharedBook(a)
    const inAttic = await copyOf(a, noted, 'Vintti, laatikko 3')
    await copyOf(a, noted)

    expect(await search(asA, 'VELJES')).toEqual({ ids: [byTitle], total: 1 })
    expect(await search(asA, 'kivi')).toEqual({ ids: [byAuthor], total: 1 })
    expect(await search(asA, 'leino')).toEqual({ ids: [byAuthorWithRow], total: 1 })
    expect(await search(asA, 'muumi')).toEqual({ ids: [bySeries], total: 1 })
    expect(await search(asA, isbnBook.isbn13!.slice(3))).toEqual({ ids: [byIsbn], total: 1 })
    expect(await search(asA, 'vintti')).toEqual({ ids: [inAttic], total: 1 })
    expect((await search(asA, '   ')).total).toBe(7)
  })

  it('folds case but never accents', async () => {
    const a = await createUser({ displayName: 'Search Accents' })
    const asA = await contextFor(a)
    const arra = await copyOf(a, await sharedBook(a, { title: 'Ärrä' }))

    expect(await search(asA, 'arra')).toEqual({ ids: [], total: 0 })
    expect(await search(asA, 'ÄRRÄ')).toEqual({ ids: [arra], total: 1 })
  })

  it('matches %, _ and \\ literally', async () => {
    const a = await createUser({ displayName: 'Search Literals' })
    const asA = await contextFor(a)
    const percent = await copyOf(a, await sharedBook(a, { title: '100% totta' }))
    await copyOf(a, await sharedBook(a, { title: '100 totta' }))
    const underscore = await copyOf(a, await sharedBook(a, { title: 'a_b' }))
    await copyOf(a, await sharedBook(a, { title: 'axb' }))
    const backslash = await copyOf(a, await sharedBook(a, { title: 'C:\\kansio' }))

    expect(await search(asA, '%')).toEqual({ ids: [percent], total: 1 })
    expect(await search(asA, '_')).toEqual({ ids: [underscore], total: 1 })
    expect(await search(asA, '\\')).toEqual({ ids: [backslash], total: 1 })
  })

  it('searches an overridden title, authors and series by the override only', async () => {
    const a = await createUser({ displayName: 'Search Overrides' })
    const asA = await contextFor(a)
    const shared = await sharedRecord(a, 'authors', 'Vanha Kirjailija')
    const own = await sharedRecord(a, 'authors', 'Uusi Kirjailija')
    const oldSeries = await sharedRecord(a, 'series', 'Kesäsarja')
    const newSeries = await sharedRecord(a, 'series', 'Talvisarja')
    const book = await sharedBook(a, { title: 'Vanha', authors: [shared], series: oldSeries })
    const copy = await copyOf(a, book)
    await upsertUserBook(asA, book.id, {
      overrides: { title: 'Uusi', authors: [own], series: newSeries },
    })

    expect(await search(asA, 'vanha')).toEqual({ ids: [], total: 0 })
    expect(await search(asA, 'uusi')).toEqual({ ids: [copy], total: 1 })
    expect(await search(asA, 'uusi kirj')).toEqual({ ids: [copy], total: 1 })
    expect(await search(asA, 'kesäsarja')).toEqual({ ids: [], total: 0 })
    expect(await search(asA, 'talvisarja')).toEqual({ ids: [copy], total: 1 })
  })
})
