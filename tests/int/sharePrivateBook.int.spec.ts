import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest'

import { upsertUserBook } from '@/lib/books/upsertUserBook'
import { mediaDir } from '@/lib/catalogue/covers'
import { DomainError } from '@/lib/errors'
import { saveCopy, type SaveInput } from '@/lib/catalogue/saveCopy'
import type { Context } from '@/lib/payload/context'
import { heldOutcome, lookupSources } from '@/lib/metadata/lookup'
import type { SourceResult, SourcesOutcome } from '@/lib/metadata/source'
import { undo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'
import { rejectedPaths } from '../helpers/validation'

// Story 3.39, FR-12/AD-5/D-8: the creator's next `{ isbn13 }` save of a
// private Book shares it in place when a `found` outcome is held, or merges
// it into the shared Book with its ISBN. Private Books are made with the
// manual save. The sources are faked at `lookupSources` (never asked by a
// save) and `heldOutcome`, the cover host at `fetch`.

vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn(), heldOutcome: vi.fn() }))

const COVER_URL = 'https://api.finna.fi/Cover/Show?source=Solr&id=x&index=0&size=large'

const suffix = () => randomUUID().slice(0, 8)

const found = (candidate: Partial<SourceResult> & { isbn13: string }): SourcesOutcome => ({
  kind: 'found',
  candidates: [
    {
      title: 'T2',
      authors: [],
      subjects: [],
      themes: ['sota'],
      source: 'finna',
      recordId: 'finna.1',
      raw: { finna: {} },
      ...candidate,
    },
  ],
  raw: {
    v: 1,
    fetchedAt: '2026-10-20T00:00:00.000Z',
    sources: { finna: { id: candidate.isbn13 } },
    subjects: {},
    coverUrl: candidate.coverUrl ?? null,
  },
})

const isbnInput = (isbn13: string): SaveInput => ({
  requestId: randomUUID(),
  target: { isbn13 },
  save: { kind: 'copy' },
})

describe('saveCopy of a held private Book', () => {
  let payload: Payload
  let jpeg: Buffer
  let fetchSpy: MockInstance<typeof fetch>
  const mediaIds: number[] = []
  const filenames: string[] = []

  const bookById = (id: number, depth = 0) =>
    payload.findByID({ collection: 'books', id, overrideAccess: true, depth })

  const booksWithIsbn = async (isbn13: string) =>
    (
      await payload.find({
        collection: 'books',
        where: { isbn13: { equals: isbn13 } },
        overrideAccess: true,
        depth: 0,
        pagination: false,
      })
    ).docs

  const copiesOf = async (user: User) =>
    (
      await payload.find({
        collection: 'copies',
        where: { owner: { equals: user.id } },
        overrideAccess: true,
        depth: 0,
        pagination: false,
      })
    ).docs

  const rowsOf = async (user: User) =>
    (
      await payload.find({
        collection: 'user-books',
        where: { owner: { equals: user.id } },
        overrideAccess: true,
        depth: 0,
        pagination: false,
      })
    ).docs

  /** Records a Book's cover for cleanup and returns its row. */
  const trackCover = async (bookId: number) => {
    const book = await bookById(bookId, 1)
    const media = book.cover
    if (typeof media !== 'object' || media === null) throw new Error('Book has no cover row')
    mediaIds.push(media.id)
    filenames.push(media.filename!)
    return media
  }

  const freshUser = async (admin = false) => {
    const user = await createUser({
      displayName: 'Share Private User',
      ...(admin && { roles: ['admin'] }),
    })
    return { user, ctx: await contextFor(user) }
  }

  /** A private Book of the context's user from a manual save, with one copy. */
  const privateBook = async (ctx: Context, isbn: string, title: string, author: string) => {
    const { bookId } = await saveCopy(ctx, {
      requestId: randomUUID(),
      target: { manual: { isbn, title, authors: [author] } },
      save: { kind: 'copy' },
    })
    return bookById(bookId)
  }

  /** A shared Book as `ensureSharedBook()` leaves it, with one shared author. */
  const sharedBook = async (isbn13: string, title: string, author: string): Promise<Book> => {
    const system = { overrideAccess: true, depth: 0 } as const
    const shared = await payload.create({
      collection: 'authors',
      data: { name: author, nameKey: '', visibility: 'shared' },
      ...system,
    })
    return payload.create({
      collection: 'books',
      data: { isbn13, title, authors: [shared.id], source: 'finna', visibility: 'shared' },
      ...system,
    })
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    jpeg = await sharp({
      create: { width: 4, height: 6, channels: 3, background: { r: 20, g: 90, b: 160 } },
    })
      .jpeg()
      .toBuffer()
  })

  beforeEach(() => {
    vi.mocked(lookupSources).mockReset()
    vi.mocked(heldOutcome).mockReset()
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg' } }),
      )
  })

  afterEach(() => {
    expect(lookupSources).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    for (const id of mediaIds) {
      await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const filename of filenames) {
      await fs.rm(path.join(mediaDir(payload), filename), { force: true })
    }
  })

  /** A's private Book with ISBN X and a held `found` outcome for X. */
  const promoteSetup = async (admin = false) => {
    const { user, ctx } = await freshUser(admin)
    const isbn = randomIsbn()
    const key = suffix()
    const own = await privateBook(ctx, isbn, 'T1', `aleksis kivi ${key}`)
    const names = { author: `Aleksis Kivi ${key}`, series: `S ${key}` }
    vi.mocked(heldOutcome).mockReturnValue(
      found({
        isbn13: isbn,
        authors: [{ name: names.author, sortName: `Kivi, Aleksis ${key}` }],
        series: names.series,
        coverUrl: COVER_URL,
      }),
    )
    return { user, ctx, isbn, own, names, key }
  }

  it.each([
    ['a user', false, true],
    ['the admin', true, false],
  ] as const)(
    'promotes the private Book in place for %s, overriding differing values',
    async (_, admin, overrides) => {
      const { user, ctx, isbn, own, names, key } = await promoteSetup(admin)

      const result = await saveCopy(ctx, isbnInput(isbn))

      expect(result.bookId).toBe(own.id)
      const media = await trackCover(own.id)
      const book = await bookById(own.id, 1)
      expect(book).toMatchObject({
        isbn13: isbn,
        title: 'T2',
        source: 'finna',
        themes: ['sota'],
        visibility: 'shared',
        rawMetadata: { sources: { finna: { id: isbn } } },
      })
      expect(book.createdBy ?? null).toBeNull()
      expect(book.authors).toMatchObject([
        { name: names.author, sortName: `Kivi, Aleksis ${key}`, visibility: 'shared' },
      ])
      expect(book.series).toMatchObject({ name: names.series, visibility: 'shared' })
      expect(await fs.readdir(mediaDir(payload))).toContain(media.filename)
      expect(fetchSpy).toHaveBeenCalledOnce()
      expect((await copiesOf(user)).map((copy) => copy.book)).toEqual([own.id, own.id])

      const rows = await rowsOf(user)
      if (overrides) {
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ book: own.id, overridden: ['title'], title: 'T1' })
      } else {
        expect(rows).toEqual([])
      }
    },
  )

  it('clears a field the source lacks and keeps it as an override', async () => {
    const { user, ctx, isbn, own } = await promoteSetup()
    await payload.update({
      collection: 'books',
      id: own.id,
      data: { publisher: 'Otava' },
      overrideAccess: true,
      depth: 0,
      req: ctx.req,
    })

    await saveCopy(ctx, isbnInput(isbn))
    await trackCover(own.id)

    expect((await bookById(own.id)).publisher ?? null).toBeNull()
    const [row] = await rowsOf(user)
    expect(row).toMatchObject({ overridden: ['title', 'publisher'], publisher: 'Otava' })
  })

  it('promotes with the picked candidate, or not at all when the one shown has gone', async () => {
    const { ctx } = await freshUser()
    const isbn = randomIsbn()
    const own = await privateBook(ctx, isbn, 'T1', `Minna Canth ${suffix()}`)
    const outcome = found({ isbn13: isbn })
    if (outcome.kind !== 'found') throw new Error('unreachable')
    outcome.candidates.push({ ...outcome.candidates[0]!, title: 'T3', recordId: 'finna.2' })
    vi.mocked(heldOutcome).mockReturnValue(outcome)

    const gone = { source: 'finna', recordId: 'finna.gone' }
    await expect(
      saveCopy(ctx, { ...isbnInput(isbn), target: { isbn13: isbn, pick: 1, candidate: gone } }),
    ).rejects.toMatchObject(new DomainError('NOT_FOUND'))
    expect(await bookById(own.id)).toEqual(own)

    await saveCopy(ctx, { ...isbnInput(isbn), target: { isbn13: isbn, pick: 1 } })
    expect(await bookById(own.id)).toMatchObject({ title: 'T3', visibility: 'shared' })
  })

  it('clips over-long source values when it promotes', async () => {
    const { ctx } = await freshUser()
    const isbn = randomIsbn()
    const own = await privateBook(ctx, isbn, 'T1', `Minna Canth ${suffix()}`)
    const author = `${suffix()} ${'k'.repeat(240)}`
    vi.mocked(heldOutcome).mockReturnValue(
      found({ isbn13: isbn, title: 't'.repeat(600), authors: [{ name: author }] }),
    )

    expect((await saveCopy(ctx, isbnInput(isbn))).bookId).toBe(own.id)

    const book = await bookById(own.id, 1)
    expect(book).toMatchObject({ title: 't'.repeat(500), visibility: 'shared' })
    expect(book.authors).toMatchObject([{ name: author.slice(0, 200) }])
  })

  it.each([
    ['no held outcome', undefined],
    ['a held none', { kind: 'none' } as const],
  ])('leaves the private Book as it is with %s', async (_, outcome) => {
    const { user, ctx } = await freshUser()
    const isbn = randomIsbn()
    const own = await privateBook(ctx, isbn, 'T1', `Minna Canth ${suffix()}`)
    vi.mocked(heldOutcome).mockReturnValue(outcome)

    const result = await saveCopy(ctx, isbnInput(isbn))

    expect(result.bookId).toBe(own.id)
    expect(await bookById(own.id)).toEqual(own)
    expect((await copiesOf(user)).map((copy) => copy.book)).toEqual([own.id, own.id])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['a user, no held outcome', false, false],
    ['a user, a held found', false, true],
    ['the admin', true, false],
  ])('merges the private Book into the shared one for %s', async (_, admin, held) => {
    const { user, ctx } = await freshUser(admin)
    const isbn = randomIsbn()
    const author = `Juhani Aho ${suffix()}`
    const own = await privateBook(ctx, isbn, 'T1', author)
    await upsertUserBook(ctx, own.id, { read: true })
    const shared = await sharedBook(isbn, 'T2', author.toUpperCase())
    if (held) vi.mocked(heldOutcome).mockReturnValue(found({ isbn13: isbn, coverUrl: COVER_URL }))

    const result = await saveCopy(ctx, isbnInput(isbn))

    expect(result.bookId).toBe(shared.id)
    expect((await booksWithIsbn(isbn)).map((book) => book.id)).toEqual([shared.id])
    expect((await copiesOf(user)).map((copy) => copy.book)).toEqual([shared.id, shared.id])
    const rows = await rowsOf(user)
    expect(rows).toHaveLength(1)
    // The authors share a name key, so only the title differs.
    expect(rows[0]).toMatchObject(
      admin
        ? { book: shared.id, read: true, overridden: [] }
        : { book: shared.id, read: true, overridden: ['title'], title: 'T1' },
    )
    expect(await bookById(shared.id)).toMatchObject({ title: 'T2', visibility: 'shared' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('merges into an existing row on the shared Book, keeping its rating and overrides', async () => {
    const { user, ctx } = await freshUser()
    const isbn = randomIsbn()
    const own = await privateBook(ctx, isbn, 'T1', `Eino Leino ${suffix()}`)
    await upsertUserBook(ctx, own.id, { read: true, rating: 4 })
    const shared = await sharedBook(isbn, 'T2', `Eino Leino ${suffix()}`)
    await upsertUserBook(ctx, shared.id, { rating: 2, overrides: { title: 'Mine' } })
    const [before] = (await rowsOf(user)).filter((row) => row.book === shared.id)

    await saveCopy(ctx, isbnInput(isbn))

    const rows = await rowsOf(user)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: before!.id,
      book: shared.id,
      read: true,
      rating: 2,
      ratedAt: before!.ratedAt,
      title: 'Mine',
    })
    // The differing authors are written; the kept title override is not replaced.
    expect(rows[0]!.overridden).toEqual(['title', 'authors'])
    expect(rows[0]!.authors).toEqual(own.authors)
  })

  it("takes the private row's rating when the shared row has none", async () => {
    const { user, ctx } = await freshUser()
    const isbn = randomIsbn()
    const author = `Eino Leino ${suffix()}`
    const own = await privateBook(ctx, isbn, 'T1', author)
    await upsertUserBook(ctx, own.id, { rating: 4 })
    const [ownRow] = await rowsOf(user)
    const shared = await sharedBook(isbn, 'T2', author)
    await upsertUserBook(ctx, shared.id, { overrides: { title: 'Mine' } })

    await saveCopy(ctx, isbnInput(isbn))

    const rows = await rowsOf(user)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      book: shared.id,
      rating: 4,
      ratedAt: ownRow!.ratedAt,
      title: 'Mine',
    })
    expect(rows[0]!.id).not.toBe(ownRow!.id)
  })

  it.each([
    ['a promote', 'promote', false],
    ['a merge', 'merge', false],
    ["the admin's merge", 'merge', true],
  ] as const)("leaves another user's private Book and copy alone on %s", async (_, kind, admin) => {
    const { ctx, isbn, own } = await promoteSetup(admin)
    const b = await freshUser()
    const ofB = await privateBook(b.ctx, isbn, 'T1', `Aleksis Kivi ${suffix()}`)
    const [copyOfB] = await copiesOf(b.user)
    if (kind === 'merge') await sharedBook(isbn, 'T2', `Aleksis Kivi ${suffix()}`)

    await saveCopy(ctx, isbnInput(isbn))
    if (kind === 'promote') await trackCover(own.id)

    expect(await bookById(ofB.id)).toEqual(ofB)
    expect(await copiesOf(b.user)).toEqual([copyOfB])
    expect(await rowsOf(b.user)).toEqual([])
  })

  it.each(['promote', 'merge'] as const)(
    'undo after a %s deletes only the new copy',
    async (kind) => {
      const { user, ctx, isbn, own, names } = await promoteSetup()
      await upsertUserBook(ctx, own.id, { read: true })
      const shared = kind === 'merge' ? await sharedBook(isbn, 'T2', names.author) : own
      const [oldCopy] = await copiesOf(user)

      const result = await saveCopy(ctx, isbnInput(isbn))
      if (kind === 'promote') await trackCover(own.id)
      const rowsBefore = await rowsOf(user)
      await undo(ctx, result.undoToken)

      expect(await bookById(shared.id)).toMatchObject({ visibility: 'shared' })
      expect(await copiesOf(user)).toEqual([
        { ...oldCopy, book: shared.id, updatedAt: expect.any(String) },
      ])
      expect(await rowsOf(user)).toEqual(rowsBefore)
      expect(rowsBefore[0]).toMatchObject({ book: shared.id, read: true, overridden: ['title'] })
    },
  )

  it('rolls back a promote whose copy fails, removing the cover file', async () => {
    const { user, isbn, own } = await promoteSetup()
    // A default that names no location: the copy insert is the failing write.
    const broken = await contextFor({ ...user, defaultLocation: 2_000_000_000 })
    const renamed: string[] = []
    const rename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      renamed.push(path.basename(String(to)))
      return rename(from, to)
    })

    expect(await rejectedPaths(saveCopy(broken, isbnInput(isbn)))).toEqual(['location'])

    expect(renamed).toHaveLength(1)
    filenames.push(renamed[0]!)
    expect(await bookById(own.id)).toEqual(own)
    expect(await rowsOf(user)).toEqual([])
    expect(await copiesOf(user)).toHaveLength(1)
    expect(await fs.readdir(mediaDir(payload))).not.toContain(renamed[0])
  })
})
