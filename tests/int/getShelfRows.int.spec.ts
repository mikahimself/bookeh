import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { upsertUserBook } from '@/lib/books/upsertUserBook'
import * as gateway from '@/lib/payload/gateway'
import { getShelfRows } from '@/lib/shelf/getShelfRows'
import { shelfIds } from '@/lib/shelf/shelfIds'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `getShelfRows()`, AD-7: one hydrated read whose pages concatenate to the
// full read in `shelfIds`' order, and `labels` that name only filter ids the
// viewer may see: own locations, system genres in their language, authors and
// series only through an effective value on one of their copies.
// Each test has its own users. Shared name keys are unique and rows stay, so
// names carry a per-run suffix.

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

describe('getShelfRows', () => {
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
      req: await reqFor(by),
    })

  const copyOf = async (user: User, book: Book) =>
    (
      await gateway.create(await contextFor(user), {
        collection: 'copies',
        data: { owner: user.id, book: book.id, status: 'owned' },
        depth: 0,
      })
    ).id

  const locationOf = async (user: User, name: string) =>
    gateway.create(await contextFor(user), {
      collection: 'locations',
      data: { owner: user.id, name, nameKey: 'ignored' },
      depth: 0,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('pages concatenate to the full read in shelfIds order, overrides applied', async () => {
    const a = await createUser({ displayName: 'Rows Paging' })
    const asA = await contextFor(a)
    const x = await sharedBook(a, { title: 'Xylofoni' })
    await copyOf(a, x)
    await copyOf(a, x)
    for (const title of ['Yksi', 'Kaksi', 'Kolme']) await copyOf(a, await sharedBook(a, { title }))
    await upsertUserBook(asA, x.id, { overrides: { title: 'Oma nimi' } })
    const query = { filters: {}, sort: 'added', dir: 'asc' } as const

    const full = await getShelfRows(asA, query, { offset: 0, limit: 5 })
    const first = await getShelfRows(asA, query, { offset: 0, limit: 2 })
    const rest = await getShelfRows(asA, query, { offset: 2, limit: 3 })
    const ids = await shelfIds(asA, query, { offset: 0, limit: 5 })

    expect(full.total).toBe(ids.total)
    expect(full.rows.map((row) => ({ copyId: row.copy.copyId, bookId: row.book.bookId }))).toEqual(
      ids.ids,
    )
    expect([...first.rows, ...rest.rows]).toEqual(full.rows)
    expect(first.total).toBe(5)

    const [one, two] = full.rows
    expect(one.copy.copyId).not.toBe(two.copy.copyId)
    expect(two.book).toEqual(one.book)
    expect(one.book.title).toBe('Oma nimi')
  })

  it('names only own locations, system genres and authors or series reached through a copy', async () => {
    const a = await createUser({ displayName: 'Rows Labels A', language: 'fi' })
    const b = await createUser({ displayName: 'Rows Labels B' })
    const asA = await contextFor(a)

    // s is reached through A's override to a private author with s's name.
    const sName = unique('Aleksis Kivi')
    const s = await record(b, 'authors', sName, 'shared')
    const likeS = await record(a, 'authors', sName, 'private')
    // t is the Book's own author, but A's override replaces it.
    const t = await record(b, 'authors', unique('Overridden'), 'shared')
    const loose = await record(b, 'authors', unique('Nobody'), 'shared')
    const secret = await record(b, 'authors', unique('Secret'), 'private')
    const series = await record(b, 'series', unique('Muumit'), 'shared')
    const looseSeries = await record(b, 'series', unique('Muut'), 'shared')
    // B's private records sharing a reached `name_key`: unreadable to A, so unnamed.
    const bLikeS = await record(b, 'authors', sName, 'private')
    const bLikeSeries = await record(b, 'series', series.name, 'private')

    const x = await sharedBook(b, { authors: [t.id], series: series.id })
    await copyOf(a, x)
    await upsertUserBook(asA, x.id, { overrides: { authors: [likeS.id] } })

    const shelf = await locationOf(a, unique('Hylly'))
    const othersShelf = await locationOf(b, unique('Vintti'))
    const genre = await payload.create({
      collection: 'genres',
      data: { name: unique('History'), nameFi: unique('Historia'), nameKey: '' },
      overrideAccess: true,
      depth: 0,
    })

    const { labels } = await getShelfRows(
      asA,
      {
        filters: {
          location: [shelf.id, othersShelf.id],
          genre: [genre.id],
          author: [s.id, t.id, loose.id, secret.id, bLikeS.id],
          series: [series.id, looseSeries.id, bLikeSeries.id],
        },
        sort: 'added',
        dir: 'asc',
      },
      { offset: 0, limit: 50 },
    )

    expect(labels).toEqual({
      [`location:${shelf.id}`]: shelf.name,
      [`genre:${genre.id}`]: genre.nameFi,
      [`author:${s.id}`]: sName,
      [`series:${series.id}`]: series.name,
    })
  })
})
