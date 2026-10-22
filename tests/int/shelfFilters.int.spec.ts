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

// `shelfIds()` scalar filters, AD-7 (FR-25): fields AND, values within a
// field OR, the count narrowed with the page; Book fields by effective value
// (AD-6); ranges open at either end exclude no value; read and rating from
// the viewer's `user-books` row, a missing row unread and unrated.
// Each test has its own users; owner scoping keeps them apart.

const ALL = { offset: 0, limit: 50 }

describe('shelf scalar filters', () => {
  let payload: Payload

  const sharedBook = async (by: User, data: Partial<Book> = {}) =>
    payload.create({
      collection: 'books',
      data: { title: 'Kirja', isbn13: randomIsbn(), visibility: 'shared', ...data },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(by)).req,
    })

  const copyOf = async (
    user: User,
    book: Book,
    data: { status?: 'owned' | 'ordered'; location?: number } = {},
  ) =>
    (
      await gateway.create(await contextFor(user), {
        collection: 'copies',
        data: { owner: user.id, book: book.id, status: 'owned', ...data },
        depth: 0,
      })
    ).id

  /** A location of `user`'s; the hook derives `nameKey`, given only to satisfy the create type. */
  const locationOf = async (user: User, name: string) =>
    gateway.create(await contextFor(user), {
      collection: 'locations',
      data: { owner: user.id, name, nameKey: 'ignored' },
      depth: 0,
    })

  /** The copies `filters` lists, in the order added, and the total. */
  const listed = async (ctx: Context, filters: ShelfQuery['filters']) => {
    const { ids, total } = await shelfIds(ctx, { filters, sort: 'added', dir: 'asc' }, ALL)
    return { copies: ids.map((id) => id.copyId), total }
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('ORs values within a field and ANDs fields, the total with them', async () => {
    const a = await createUser({ displayName: 'Filters Mix' })
    const asA = await contextFor(a)
    const fi = await copyOf(a, await sharedBook(a, { language: 'fi' }))
    const sv = await copyOf(a, await sharedBook(a, { language: 'sv' }))
    await copyOf(a, await sharedBook(a, { language: 'en' }))
    await copyOf(a, await sharedBook(a, { language: 'fi' }), { status: 'ordered' })

    expect(await listed(asA, { language: ['sv', 'fi'], status: ['owned'] })).toEqual({
      copies: [fi, sv],
      total: 2,
    })
    expect(await listed(asA, { language: ['fi'], status: ['owned'] })).toEqual({
      copies: [fi],
      total: 1,
    })
    expect((await listed(asA, { language: [], status: [] })).total).toBe(4)
  })

  it('matches publisher and language by effective value, exactly', async () => {
    const a = await createUser({ displayName: 'Filters Publisher' })
    const asA = await contextFor(a)
    const wsoy = await copyOf(a, await sharedBook(a, { publisher: 'WSOY' }))
    const overridden = await sharedBook(a, { publisher: 'WSOY', language: 'fi' })
    const otava = await copyOf(a, overridden)
    await upsertUserBook(asA, overridden.id, { overrides: { publisher: 'Otava', language: 'sv' } })
    await copyOf(a, await sharedBook(a, { publisher: 'WSOY Pro' }))

    expect(await listed(asA, { publisher: ['WSOY'] })).toEqual({ copies: [wsoy], total: 1 })
    expect(await listed(asA, { publisher: ['Otava'] })).toEqual({ copies: [otava], total: 1 })
    expect(await listed(asA, { language: ['sv'] })).toEqual({ copies: [otava], total: 1 })
    expect((await listed(asA, { language: ['fi'] })).total).toBe(0)
  })

  it('filters year and pages as inclusive ranges, either end open, no value never matching', async () => {
    const a = await createUser({ displayName: 'Filters Ranges' })
    const asA = await contextFor(a)
    const y1990 = await copyOf(a, await sharedBook(a, { year: 1990, pages: 300 }))
    const y2000 = await copyOf(a, await sharedBook(a, { year: 2000, pages: 500 }))
    const none = await copyOf(a, await sharedBook(a))
    const later = await sharedBook(a, { year: 1990, pages: 300 })
    const y2005 = await copyOf(a, later)
    await upsertUserBook(asA, later.id, { overrides: { year: 2005, pages: null } })

    expect(await listed(asA, { year: [2000, undefined] })).toEqual({
      copies: [y2000, y2005],
      total: 2,
    })
    expect(await listed(asA, { year: [undefined, 1995] })).toEqual({ copies: [y1990], total: 1 })
    expect(await listed(asA, { year: [1990, 2000] })).toEqual({
      copies: [y1990, y2000],
      total: 2,
    })
    // The cleared override hides the shared 300 pages.
    expect(await listed(asA, { pages: [undefined, 500] })).toEqual({
      copies: [y1990, y2000],
      total: 2,
    })
    expect(await listed(asA, { pages: [301, undefined] })).toEqual({ copies: [y2000], total: 1 })
    expect(await listed(asA, { year: [undefined, undefined] })).toEqual({
      copies: [y1990, y2000, none, y2005],
      total: 4,
    })
  })

  it("matches location and status on each copy's own values", async () => {
    const a = await createUser({ displayName: 'Filters Copies' })
    const asA = await contextFor(a)
    const hylly = await locationOf(a, 'Hylly')
    const arkku = await locationOf(a, 'Arkku')
    const book = await sharedBook(a)
    const shelved = await copyOf(a, book, { location: hylly.id })
    const ordered = await copyOf(a, book, { status: 'ordered' })
    const stored = await copyOf(a, await sharedBook(a), { location: arkku.id })

    expect(await listed(asA, { location: [hylly.id] })).toEqual({ copies: [shelved], total: 1 })
    expect(await listed(asA, { location: [hylly.id, arkku.id] })).toEqual({
      copies: [shelved, stored],
      total: 2,
    })
    expect(await listed(asA, { status: ['ordered'] })).toEqual({ copies: [ordered], total: 1 })
  })

  it("reads read and rating from the viewer's row, a missing row unread and unrated", async () => {
    const a = await createUser({ displayName: 'Filters Read' })
    const b = await createUser({ displayName: 'Filters Other' })
    const asA = await contextFor(a)
    const loved = await sharedBook(a)
    const meh = await sharedBook(a)
    const untouched = await sharedBook(a)
    const lovedCopy = await copyOf(a, loved)
    const mehCopy = await copyOf(a, meh)
    const untouchedCopy = await copyOf(a, untouched)
    await upsertUserBook(asA, loved.id, { read: true, rating: 4 })
    await upsertUserBook(asA, meh.id, { rating: 2 })
    // B's row must not count for A (AD-6: `user_books` joins on the viewer).
    await upsertUserBook(await contextFor(b), untouched.id, { read: true, rating: 5 })

    expect(await listed(asA, { read: true })).toEqual({ copies: [lovedCopy], total: 1 })
    expect(await listed(asA, { read: false })).toEqual({
      copies: [mehCopy, untouchedCopy],
      total: 2,
    })
    expect(await listed(asA, { ratingMin: 3 })).toEqual({ copies: [lovedCopy], total: 1 })
    expect(await listed(asA, { ratingMin: 4 })).toEqual({ copies: [lovedCopy], total: 1 })
    expect(await listed(asA, { ratingMin: 1 })).toEqual({
      copies: [lovedCopy, mehCopy],
      total: 2,
    })
  })
})
