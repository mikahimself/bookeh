import { randomUUID } from 'node:crypto'

import { getPayload, NotFound, type Payload, ValidationError } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { getEffectiveBooks } from '@/lib/books/effectiveBook'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { withTransaction } from '@/lib/payload/transaction'
import config from '@/payload.config'
import type { Author, Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `upsertUserBook()`, AD-6/AD-16/AD-18: the one writer of `user-books`
// creates the lazy row on the first write and updates it after, keeps
// `overridden` in step with the stored values and `rating` with `ratedAt`,
// allows overrides on shared Books only, and leaves a lost race to the unique
// index.

describe('upsertUserBook', () => {
  let payload: Payload
  let a: User
  let b: User
  let asA: Context
  let author: Author

  /** A Book as `lib/catalogue` creates it, with a fresh ISBN. */
  const bookFor = async (user: User, visibility: Book['visibility'], extra: Partial<Book> = {}) =>
    payload.create({
      collection: 'books',
      data: { title: 'Kalevala', isbn13: randomIsbn(), visibility, ...extra },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  /** The user's rows on a Book, as persisted. */
  const rowsOf = async (user: User, book: Book) =>
    (
      await payload.find({
        collection: 'user-books',
        where: { and: [{ owner: { equals: user.id } }, { book: { equals: book.id } }] },
        overrideAccess: true,
        depth: 0,
      })
    ).docs

  const countOf = async (user: User, book: Book) =>
    (
      await payload.count({
        collection: 'user-books',
        where: { and: [{ owner: { equals: user.id } }, { book: { equals: book.id } }] },
        overrideAccess: true,
      })
    ).totalDocs

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Upsert User A' })
    b = await createUser({ displayName: 'Upsert User B' })
    asA = await contextFor(a)
    author = await payload.create({
      collection: 'authors',
      data: { name: `Author ${randomUUID().slice(0, 8)}`, visibility: 'shared', nameKey: '' },
      overrideAccess: true,
      depth: 0,
    })
  })

  it('creates the row on the first write and updates it after', async () => {
    const book = await bookFor(a, 'shared', { subtitle: 'Suomen kansalliseepos' })

    await upsertUserBook(asA, book.id, {
      // The publisher arrives decomposed (a + combining diaeresis) and is stored precomposed.
      overrides: { title: ' Oma ', subtitle: '', publisher: 'Hämeenlinna' },
      read: true,
      rating: 4,
    })
    const [created] = await rowsOf(a, book)
    expect(created).toMatchObject({
      title: 'Oma',
      subtitle: null,
      publisher: 'Hämeenlinna',
      overridden: ['title', 'subtitle', 'publisher'],
      read: true,
      rating: 4,
    })
    expect(created?.ratedAt).toEqual(expect.any(String))

    await upsertUserBook(asA, book.id, {
      // A repeated id is stored once.
      overrides: { authors: [author.id, author.id] },
      dropOverrides: ['subtitle'],
      read: false,
      rating: null,
    })
    const rows = await rowsOf(a, book)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: created?.id,
      title: 'Oma',
      subtitle: null,
      authors: [author.id],
      overridden: ['title', 'authors', 'publisher'],
      read: false,
      rating: null,
      ratedAt: null,
    })

    // The reader shows the written values and the Book's value for the dropped field.
    const seen = (await getEffectiveBooks(asA, [book.id])).get(book.id)
    expect(seen).toMatchObject({
      title: 'Oma',
      subtitle: 'Suomen kansalliseepos',
      authors: [{ id: author.id, name: author.name }],
      overridden: ['title', 'authors', 'publisher'],
    })
  })

  it('drops the last override from an existing row', async () => {
    const book = await bookFor(a, 'shared')
    await upsertUserBook(asA, book.id, { overrides: { title: 'x' } })
    await upsertUserBook(asA, book.id, { dropOverrides: ['title'] })
    const rows = await rowsOf(a, book)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: null, overridden: [] })
    expect((await getEffectiveBooks(asA, [book.id])).get(book.id)?.title).toBe('Kalevala')
  })

  it('refuses a title override that clears the title', async () => {
    const book = await bookFor(a, 'shared')
    const error: unknown = await upsertUserBook(asA, book.id, { overrides: { title: '  ' } }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ code: 'VALIDATION', fields: { title: 'VALIDATION' } })
    expect(await countOf(a, book)).toBe(0)
  })

  it('stores a cleared relation as empty and lists it', async () => {
    const book = await bookFor(a, 'shared', { authors: [author.id] })
    await upsertUserBook(asA, book.id, { overrides: { authors: [], series: null } })
    const [row] = await rowsOf(a, book)
    expect(row).toMatchObject({ authors: [], series: null, overridden: ['authors', 'series'] })
    expect((await getEffectiveBooks(asA, [book.id])).get(book.id)).toMatchObject({
      authors: [],
      series: null,
    })
  })

  it('refuses overrides on a private Book and takes its state', async () => {
    const own = await bookFor(a, 'private')
    const error: unknown = await upsertUserBook(asA, own.id, { overrides: { title: 'x' } }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ code: 'VALIDATION', fields: { title: 'VALIDATION' } })
    expect(await countOf(a, own)).toBe(0)

    await upsertUserBook(asA, own.id, { read: true, rating: 5 })
    const [row] = await rowsOf(a, own)
    expect(row).toMatchObject({ read: true, rating: 5, overridden: [] })
  })

  it("fails with NotFound on another user's private Book", async () => {
    const foreign = await bookFor(b, 'private')
    await expect(
      upsertUserBook(asA, foreign.id, { overrides: { title: 'x' } }),
    ).rejects.toThrow(NotFound)
    expect(await countOf(a, foreign)).toBe(0)
  })

  it('creates no row when there is nothing to store', async () => {
    const book = await bookFor(a, 'shared')
    await upsertUserBook(asA, book.id, {})
    await upsertUserBook(asA, book.id, { dropOverrides: ['title'] })
    await upsertUserBook(asA, book.id, { overrides: { title: undefined } })
    expect(await countOf(a, book)).toBe(0)
  })

  it("joins the caller's transaction", async () => {
    const book = await bookFor(a, 'shared')
    const e = new Error('boom')
    await expect(
      withTransaction(asA, async (tx) => {
        await upsertUserBook(tx, book.id, { read: true })
        throw e
      }),
    ).rejects.toBe(e)
    expect(await countOf(a, book)).toBe(0)
  })

  it('leaves one row after two concurrent first writes', async () => {
    const book = await bookFor(a, 'shared')
    // Two independent contexts: each write opens its own transaction.
    const contexts = await Promise.all([contextFor(a), contextFor(a)])
    const settled = await Promise.allSettled(
      contexts.map((ctx, index) => upsertUserBook(ctx, book.id, { rating: index + 1 })),
    )
    const statuses = settled.map((result) => result.status).sort()
    expect(statuses).toEqual(['fulfilled', 'rejected'])
    const rejected = settled.find((result) => result.status === 'rejected')
    expect(rejected?.reason).toBeInstanceOf(ValidationError)
    expect(await countOf(a, book)).toBe(1)
  })
})
