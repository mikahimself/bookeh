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

// `shelfIds()` filters, AD-7 (FR-25): fields AND, values within a
// field OR, the count narrowed with the page; Book fields by effective value
// (AD-6); ranges open at either end exclude no value; read and rating from
// the viewer's `user-books` row, a missing row unread and unrated.
// Author and series ids stand for every readable record with their
// `name_key`, matched against effective values; genres are the Book's own.
// Each test has its own users; owner scoping keeps them apart. Shared name
// keys are unique and rows stay, so names carry a per-run suffix.

const ALL = { offset: 0, limit: 50 }

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

describe('shelf filters', () => {
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

  /** An author or series; the hook derives `nameKey`, given only to satisfy the create type. */
  const record = async (
    by: User,
    collection: 'authors' | 'series',
    name: string,
    visibility: 'shared' | 'private',
  ) =>
    payload.create({
      collection,
      data: { name, visibility, nameKey: '' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(by)).req,
    })

  const genreNamed = (name: string) =>
    payload.create({
      collection: 'genres',
      data: { name: unique(name), nameFi: unique(name), nameKey: '' },
      overrideAccess: true,
      depth: 0,
    })

  /** The copies `filters` (and `q`) list, in the order added, and the total. */
  const listed = async (ctx: Context, filters: ShelfQuery['filters'], q?: string) => {
    const { ids, total } = await shelfIds(ctx, { q, filters, sort: 'added', dir: 'asc' }, ALL)
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

  it('matches an author id through every readable author with its name, never an unreadable id', async () => {
    const a = await createUser({ displayName: 'Filters Author A' })
    const b = await createUser({ displayName: 'Filters Author B' })
    const asA = await contextFor(a)
    const name = unique('Kivi')
    const shared = await record(b, 'authors', name, 'shared')
    const own = await record(a, 'authors', name.toLowerCase(), 'private')
    const othersPrivate = await record(b, 'authors', name, 'private')
    const other = await record(b, 'authors', unique('Leino'), 'shared')

    const x = await copyOf(a, await sharedBook(a, { authors: [shared.id] }))
    const p = await copyOf(a, await sharedBook(a, { authors: [own.id], visibility: 'private' }))
    await copyOf(a, await sharedBook(a, { authors: [other.id] }))

    expect(await listed(asA, { author: [shared.id] })).toEqual({ copies: [x, p], total: 2 })
    expect(await listed(asA, { author: [own.id] })).toEqual({ copies: [x, p], total: 2 })
    expect(await listed(asA, { author: [othersPrivate.id] })).toEqual({ copies: [], total: 0 })
  })

  it("lets the viewer's author override decide the match", async () => {
    const a = await createUser({ displayName: 'Filters Override' })
    const asA = await contextFor(a)
    const leino = await record(a, 'authors', unique('Leino'), 'shared')
    const kivi = await record(a, 'authors', unique('Kivi'), 'shared')
    const book = await sharedBook(a, { authors: [leino.id] })
    const y = await copyOf(a, book)
    await upsertUserBook(asA, book.id, { overrides: { authors: [kivi.id] } })

    expect(await listed(asA, { author: [kivi.id] })).toEqual({ copies: [y], total: 1 })
    expect(await listed(asA, { author: [leino.id] })).toEqual({ copies: [], total: 0 })
  })

  it('matches a series id through every readable series with its name, by effective value', async () => {
    const a = await createUser({ displayName: 'Filters Series A' })
    const b = await createUser({ displayName: 'Filters Series B' })
    const asA = await contextFor(a)
    const muumit = await record(b, 'series', unique('Muumit'), 'shared')
    const aPrivate = await record(a, 'series', muumit.name.toLowerCase(), 'private')
    const bPrivate = await record(b, 'series', muumit.name, 'private')
    const s1 = await record(a, 'series', unique('Eka'), 'shared')
    const s2 = await record(a, 'series', unique('Toka'), 'shared')

    const shared = await copyOf(a, await sharedBook(a, { series: muumit.id }))
    const own = await copyOf(a, await sharedBook(a, { series: aPrivate.id, visibility: 'private' }))
    const moved = await sharedBook(a, { series: s1.id })
    const movedCopy = await copyOf(a, moved)
    await upsertUserBook(asA, moved.id, { overrides: { series: s2.id } })
    await copyOf(a, await sharedBook(a))

    expect(await listed(asA, { series: [muumit.id] })).toEqual({ copies: [shared, own], total: 2 })
    expect(await listed(asA, { series: [aPrivate.id] })).toEqual({
      copies: [shared, own],
      total: 2,
    })
    expect(await listed(asA, { series: [bPrivate.id] })).toEqual({ copies: [], total: 0 })
    expect(await listed(asA, { series: [s2.id] })).toEqual({ copies: [movedCopy], total: 1 })
    expect(await listed(asA, { series: [s1.id] })).toEqual({ copies: [], total: 0 })
  })

  it('ORs genres within the field and ANDs them with other fields and q', async () => {
    const a = await createUser({ displayName: 'Filters Genre' })
    const asA = await contextFor(a)
    const muumit = await record(a, 'series', unique('Muumit'), 'shared')
    const g1 = await genreNamed('Fantasy')
    const g2 = await genreNamed('History')

    const inSeries = await copyOf(
      a,
      await sharedBook(a, { title: 'Taikurin hattu', series: muumit.id, genres: [g1.id] }),
    )
    const second = await copyOf(a, await sharedBook(a, { genres: [g2.id], language: 'sv' }))
    await copyOf(a, await sharedBook(a, { title: 'Taikurin hattu' }))

    expect(await listed(asA, { genre: [g1.id, g2.id] })).toEqual({
      copies: [inSeries, second],
      total: 2,
    })
    expect(await listed(asA, { genre: [g1.id, g2.id], language: ['sv'] })).toEqual({
      copies: [second],
      total: 1,
    })
    expect(await listed(asA, { genre: [g1.id, g2.id] }, 'taikurin')).toEqual({
      copies: [inSeries],
      total: 1,
    })
    expect(await listed(asA, { genre: [g2.id], series: [muumit.id] })).toEqual({
      copies: [],
      total: 0,
    })
  })
})
