import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { coverUrl } from '@/lib/books/coverUrl'
import { getEffectiveBooks } from '@/lib/books/effectiveBook'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Author, Book, Genre, Media, Series, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `getEffectiveBooks()`, AD-4/AD-6/AD-10: the viewer's `user-books` row laid
// over one shared Book, seen by three users; unreadable ids are absent; the
// cover URL is the one Payload computes. Shared name keys are unique and rows
// stay, so every name carries a per-run suffix.

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

describe('getEffectiveBooks', () => {
  let payload: Payload
  let a: User
  let b: User
  let asA: Context
  let asB: Context
  let asC: Context
  let authors: Author[]
  let ownAuthor: Author
  let series: Series
  let genre: Genre
  let book: Book
  let secret: Book
  let cover: Media
  let covered: Book

  /** A system write, as `lib/catalogue` makes it, with `user` on the request. */
  const systemCreate = async (user: User, visibility: Book['visibility'], extra: Partial<Book>) =>
    payload.create({
      collection: 'books',
      data: { title: 'Kalevala', isbn13: randomIsbn(), visibility, ...extra },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const createAuthor = async (user: User, visibility: Author['visibility']) =>
    payload.create({
      collection: 'authors',
      data: { name: unique('Author'), visibility, nameKey: '' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const named = ({ id, name }: { id: number; name: string }) => ({ id, name })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Effective User A', language: 'fi' })
    b = await createUser({ displayName: 'Effective User B', language: 'en' })
    const c = await createUser({ displayName: 'Effective User C', language: 'en' })
    asA = await contextFor(a)
    asB = await contextFor(b)
    asC = await contextFor(c)

    authors = [await createAuthor(a, 'shared'), await createAuthor(a, 'shared')]
    ownAuthor = await createAuthor(a, 'shared')
    // A's private author on a shared Book: a target B cannot read.
    const privateOfA = await createAuthor(a, 'private')
    series = await payload.create({
      collection: 'series',
      data: { name: unique('Series'), visibility: 'shared', nameKey: '' },
      overrideAccess: true,
      depth: 0,
    })
    genre = await payload.create({
      collection: 'genres',
      data: { name: unique('History'), nameFi: unique('Historia'), nameKey: '' },
      overrideAccess: true,
      depth: 0,
    })

    book = await systemCreate(a, 'shared', {
      subtitle: 'Suomen kansalliseepos',
      authors: [...authors.map((author) => author.id), privateOfA.id],
      series: series.id,
      seriesIndex: 1,
      publisher: 'SKS',
      year: 1849,
      language: 'fi',
      pages: 500,
      description: 'Runoja.',
      genres: [genre.id],
      themes: ['mytologia'],
      source: 'finna',
    })
    // A's row: four names listed, two of them cleared; `publisher` stored but not listed.
    await gateway.create(asA, {
      collection: 'user-books',
      data: {
        owner: a.id,
        book: book.id,
        title: 'Kalevala (oma)',
        authors: [ownAuthor.id],
        subtitle: null,
        series: null,
        publisher: 'Ignored',
        overridden: ['title', 'authors', 'subtitle', 'series'],
      },
      depth: 0,
    })
    // B's row on the same Book: a cleared title and a cleared text stored as `''`.
    await gateway.create(asB, {
      collection: 'user-books',
      data: {
        owner: b.id,
        book: book.id,
        title: null,
        subtitle: '',
        overridden: ['title', 'subtitle'],
      },
      depth: 0,
    })
    secret = await systemCreate(b, 'private', {})

    const data = await sharp({
      create: { width: 2, height: 3, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .png()
      .toBuffer()
    cover = await payload.create({
      collection: 'media',
      data: { visibility: 'shared' },
      file: { data, mimetype: 'image/png', name: 'cover.png', size: data.length },
      overrideAccess: true,
    })
    covered = await systemCreate(a, 'shared', { cover: cover.id })
  })

  afterAll(async () => {
    // Deleting the row makes Payload remove the file.
    await payload
      .delete({ collection: 'media', id: cover.id, overrideAccess: true })
      .catch(() => undefined)
  })

  it('shows the Book as stored to a viewer without a row', async () => {
    const seen = await getEffectiveBooks(asC, [book.id])
    expect(seen.get(book.id)).toEqual({
      bookId: book.id,
      isbn13: book.isbn13,
      visibility: 'shared',
      source: 'finna',
      title: 'Kalevala',
      subtitle: 'Suomen kansalliseepos',
      authors: authors.map(named),
      series: named(series),
      seriesIndex: 1,
      genres: [{ id: genre.id, name: genre.name }],
      themes: ['mytologia'],
      publisher: 'SKS',
      year: 1849,
      language: 'fi',
      pages: 500,
      description: 'Runoja.',
      coverUrl: null,
      overridden: [],
    })
  })

  it('applies the listed overrides and ignores a stored value not listed', async () => {
    const seen = (await getEffectiveBooks(asA, [book.id])).get(book.id)
    expect(seen).toMatchObject({
      title: 'Kalevala (oma)',
      authors: [named(ownAuthor)],
      publisher: 'SKS',
      genres: [{ id: genre.id, name: genre.nameFi }],
      overridden: ['title', 'authors', 'subtitle', 'series'],
    })
  })

  it('reads a listed empty value as cleared', async () => {
    const seen = (await getEffectiveBooks(asA, [book.id])).get(book.id)
    expect(seen).toMatchObject({ subtitle: null, series: null })
  })

  it('lays each viewer their own row over the same Book', async () => {
    const seenByB = (await getEffectiveBooks(asB, [book.id])).get(book.id)
    expect(seenByB).toMatchObject({
      title: '',
      subtitle: null,
      authors: authors.map(named),
      overridden: ['title', 'subtitle'],
    })
    const seenByA = (await getEffectiveBooks(asA, [book.id])).get(book.id)
    expect(seenByA).toMatchObject({ title: 'Kalevala (oma)', subtitle: null })
  })

  it('returns every requested Book, beyond one page', async () => {
    const many = await Promise.all(Array.from({ length: 11 }, () => systemCreate(a, 'shared', {})))
    const ids = many.map((doc) => doc.id)
    const seen = await getEffectiveBooks(asC, ids)
    expect([...seen.keys()].sort()).toEqual([...ids].sort())
  })

  it("leaves out another user's private Book", async () => {
    const seen = await getEffectiveBooks(asA, [secret.id, book.id])
    expect([...seen.keys()]).toEqual([book.id])
    expect((await getEffectiveBooks(asB, [secret.id])).get(secret.id)?.title).toBe('Kalevala')
  })

  it("produces the cover URL Payload computes, and the preview's", async () => {
    const seen = (await getEffectiveBooks(asB, [covered.id])).get(covered.id)
    expect(seen?.coverUrl).toBe(cover.url)
    expect(seen?.coverUrl).toMatch(/^\/api\/media\/file\//)
    expect(coverUrl({ isbn13: '9789510000000' })).toBe('/data/cover/9789510000000')
  })

  it('returns an empty map for no ids', async () => {
    expect(await getEffectiveBooks(asB, [])).toEqual(new Map())
  })
})
