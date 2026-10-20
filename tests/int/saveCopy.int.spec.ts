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

import { toNameKey } from '@/fields/nameKey'
import { mediaDir } from '@/lib/catalogue/covers'
import { saveCopy, type SaveInput } from '@/lib/catalogue/saveCopy'
import {
  oncePerRequest,
  REQUEST_MEMORY_SIZE,
  REQUEST_WINDOW_MS,
} from '@/lib/catalogue/saveRequests'
import { DomainError } from '@/lib/errors'
import { lookupSources } from '@/lib/metadata/lookup'
import type { SourcesOutcome } from '@/lib/metadata/source'
import config from '@/payload.config'
import type { Book, User, UserLocation } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'
import { rejectedPaths } from '../helpers/validation'

// `saveCopy()`, AD-11/FR-21: Add to library resolves the ISBN to a Book the
// user may hold, or ensures a shared one from the source outcome with its
// cover, and saves an owned copy at the default location in one transaction.
// The sources are faked at `lookupSources`, the cover host at `fetch`.

vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn() }))

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

const COVER_URL = 'https://api.finna.fi/Cover/Show?source=Solr&id=x&index=0&size=large'

const found = (
  isbn13: string,
  names: { author: string; series: string },
): Extract<SourcesOutcome, { kind: 'found' }> => ({
  kind: 'found',
  candidates: [
    {
      isbn13,
      title: 'Täällä Pohjantähden alla',
      authors: [{ name: names.author }],
      series: names.series,
      subjects: [],
      themes: [],
      source: 'finna',
      coverUrl: COVER_URL,
      raw: { finna: {} },
    },
  ],
  raw: {
    v: 1,
    fetchedAt: '2026-10-20T00:00:00.000Z',
    sources: {},
    subjects: {},
    coverUrl: COVER_URL,
  },
})

const inputFor = (isbn13: string): SaveInput => ({
  requestId: randomUUID(),
  target: { isbn13 },
  save: { kind: 'copy' },
})

describe('saveCopy', () => {
  let payload: Payload
  let jpeg: Buffer
  let fetchSpy: MockInstance<typeof fetch>
  const mediaIds: number[] = []
  const filenames: string[] = []

  const filesInMedia = async () => (await fs.readdir(mediaDir(payload)).catch(() => [])).sort()

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

  const countByName = async (collection: 'authors' | 'series', name: string) =>
    (
      await payload.count({
        collection,
        where: { nameKey: { equals: toNameKey(name) } },
        overrideAccess: true,
      })
    ).totalDocs

  const bookFor = async (user: User | undefined, isbn13: string, visibility: Book['visibility']) =>
    payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13, visibility },
      overrideAccess: true,
      depth: 0,
      ...(user && { req: (await contextFor(user)).req }),
    })

  /** A fresh user whose profile default is a new location, and its context. */
  const userWithDefault = async () => {
    const user = await createUser({ displayName: 'Save Copy Default User' })
    const location: UserLocation = await payload.create({
      collection: 'locations',
      data: { owner: user.id, name: 'Kirjahylly', nameKey: '' },
      overrideAccess: false,
      depth: 0,
      req: (await contextFor(user)).req,
    })
    const updated = await payload.update({
      collection: 'users',
      id: user.id,
      data: { defaultLocation: location.id },
      overrideAccess: true,
    })
    return { user: updated, location, ctx: await contextFor(updated) }
  }

  const freshUser = async (data: Partial<User> = {}) => {
    const user = await createUser({ displayName: 'Save Copy User', ...data })
    return { user, ctx: await contextFor(user) }
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
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg' } }),
      )
  })

  afterEach(() => {
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

  it('creates a shared Book with its cover and an owned copy at the default location', async () => {
    const { user, location, ctx } = await userWithDefault()
    const isbn = randomIsbn()
    const names = { author: unique('Väinö Linna'), series: unique('Pohjantähti') }
    vi.mocked(lookupSources).mockResolvedValue(found(isbn, names))

    const result = await saveCopy(ctx, inputFor(isbn))

    const book = await payload.findByID({
      collection: 'books',
      id: result.bookId,
      overrideAccess: true,
      depth: 1,
    })
    const media = book.cover
    if (typeof media !== 'object' || media === null) throw new Error('Book has no cover row')
    mediaIds.push(media.id)
    filenames.push(media.filename!)
    expect(book).toMatchObject({ isbn13: isbn, visibility: 'shared' })
    expect(await filesInMedia()).toContain(media.filename)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(book.authors).toMatchObject([{ name: names.author, visibility: 'shared' }])
    expect(book.series).toMatchObject({ name: names.series, visibility: 'shared' })

    const copies = await copiesOf(user)
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({
      id: result.copyId,
      book: result.bookId,
      status: 'owned',
      location: location.id,
    })
    expect(result).toEqual({
      bookId: result.bookId,
      copyId: result.copyId,
      savedTo: { id: location.id, name: 'Kirjahylly' },
    })
  })

  it('saves the copy with no location when the user has no default', async () => {
    const { user, ctx } = await freshUser()
    const isbn = randomIsbn()
    vi.mocked(lookupSources).mockResolvedValue(
      found(isbn, { author: unique('Minna Canth'), series: unique('Näytelmät') }),
    )

    const result = await saveCopy(ctx, inputFor(isbn))
    const [book] = await booksWithIsbn(isbn)
    if (typeof book?.cover === 'number') {
      mediaIds.push(book.cover)
      const media = await payload.findByID({ collection: 'media', id: book.cover, depth: 0 })
      filenames.push(media.filename!)
    }

    expect(result.savedTo).toBeNull()
    const copies = await copiesOf(user)
    expect(copies).toHaveLength(1)
    expect(copies[0]!.location ?? null).toBeNull()
  })

  it('saves a copy of an existing shared Book without asking the sources', async () => {
    const { user, ctx } = await freshUser()
    const isbn = randomIsbn()
    const shared = await bookFor(undefined, isbn, 'shared')

    const result = await saveCopy(ctx, inputFor(isbn))

    expect(result).toMatchObject({ bookId: shared.id, savedTo: null })
    expect(await booksWithIsbn(isbn)).toHaveLength(1)
    expect((await copiesOf(user)).map((copy) => copy.book)).toEqual([shared.id])
    expect(lookupSources).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("saves a copy of the user's own private Book without creating a shared one", async () => {
    const { user, ctx } = await freshUser()
    const isbn = randomIsbn()
    const own = await bookFor(user, isbn, 'private')

    const result = await saveCopy(ctx, inputFor(isbn))

    expect(result.bookId).toBe(own.id)
    expect((await booksWithIsbn(isbn)).map((book) => book.id)).toEqual([own.id])
    expect((await copiesOf(user)).map((copy) => copy.book)).toEqual([own.id])
    expect(lookupSources).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("prefers the shared Book over the user's own private Book", async () => {
    const { user, ctx } = await freshUser()
    const isbn = randomIsbn()
    await bookFor(user, isbn, 'private')
    const shared = await bookFor(undefined, isbn, 'shared')

    const result = await saveCopy(ctx, inputFor(isbn))

    expect(result.bookId).toBe(shared.id)
    expect((await copiesOf(user)).map((copy) => copy.book)).toEqual([shared.id])
  })

  it("never uses another user's private Book, even for the admin", async () => {
    const { user: admin, ctx } = await freshUser({ roles: ['admin'] })
    const b = await createUser({ displayName: 'Save Copy User B' })
    const isbn = randomIsbn()
    const ofB = await bookFor(b, isbn, 'private')
    vi.mocked(lookupSources).mockResolvedValue(
      found(isbn, { author: unique('Aleksis Kivi'), series: unique('Kootut') }),
    )

    const result = await saveCopy(ctx, inputFor(isbn))
    const books = await booksWithIsbn(isbn)
    const created = books.find((book) => book.id === result.bookId)
    if (typeof created?.cover === 'number') {
      mediaIds.push(created.cover)
      const media = await payload.findByID({ collection: 'media', id: created.cover, depth: 0 })
      filenames.push(media.filename!)
    }

    expect(result.bookId).not.toBe(ofB.id)
    expect(created?.visibility).toBe('shared')
    expect((await copiesOf(admin)).map((copy) => copy.book)).toEqual([result.bookId])
    expect(books.find((book) => book.id === ofB.id)).toEqual(ofB)
  })

  it('rejects an invalid ISBN before any read', async () => {
    const { user, ctx } = await freshUser()
    const find = vi.spyOn(payload, 'find')

    await expect(saveCopy(ctx, inputFor('abc'))).rejects.toMatchObject(
      new DomainError('INVALID_ISBN'),
    )
    expect(find).not.toHaveBeenCalled()
    expect(lookupSources).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.restoreAllMocks()
    expect(await copiesOf(user)).toEqual([])
  })

  it('fails with NOT_FOUND when no source knows the ISBN, saving nothing', async () => {
    const { user, ctx } = await freshUser()
    const isbn = randomIsbn()
    vi.mocked(lookupSources).mockResolvedValue({ kind: 'none' })

    await expect(saveCopy(ctx, inputFor(isbn))).rejects.toMatchObject(new DomainError('NOT_FOUND'))
    expect(await booksWithIsbn(isbn)).toEqual([])
    expect(await copiesOf(user)).toEqual([])
  })

  it('rolls back the Book, its records, the cover and the copy when the copy fails', async () => {
    const created = await createUser({ displayName: 'Save Copy Broken Default' })
    // A default that names no location: the copy insert is the failing write.
    const ctx = await contextFor({ ...created, defaultLocation: 2_000_000_000 })
    const isbn = randomIsbn()
    const names = { author: unique('Kalle Päätalo'), series: unique('Iijoki') }
    vi.mocked(lookupSources).mockResolvedValue(found(isbn, names))
    // The cover's final name, from `downloadCover()`'s rename into place.
    const renamed: string[] = []
    const rename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      renamed.push(path.basename(String(to)))
      return rename(from, to)
    })

    expect(await rejectedPaths(saveCopy(ctx, inputFor(isbn)))).toEqual(['location'])

    expect(renamed).toHaveLength(1)
    const [filename] = renamed
    filenames.push(filename!)
    expect(await booksWithIsbn(isbn)).toEqual([])
    expect(await countByName('authors', names.author)).toBe(0)
    expect(await countByName('series', names.series)).toBe(0)
    expect(
      (
        await payload.count({
          collection: 'media',
          where: { filename: { equals: filename } },
          overrideAccess: true,
        })
      ).totalDocs,
    ).toBe(0)
    expect(await filesInMedia()).not.toContain(filename)
    expect(await copiesOf(created)).toEqual([])
  })

  // AD-11/AD-12: the memory is in process and shared by every test in the run,
  // so each test uses its own users and ids.
  describe('repeated requestId', () => {
    /** Records the cover of the Book `bookId` for cleanup. */
    const trackCover = async (bookId: number) => {
      const book = await payload.findByID({
        collection: 'books',
        id: bookId,
        overrideAccess: true,
        depth: 0,
      })
      if (typeof book.cover !== 'number') return
      mediaIds.push(book.cover)
      const media = await payload.findByID({ collection: 'media', id: book.cover, depth: 0 })
      filenames.push(media.filename!)
    }

    it('returns the first result on a sequential repeat and writes nothing', async () => {
      const { user, ctx } = await freshUser()
      const isbn = randomIsbn()
      vi.mocked(lookupSources).mockResolvedValue(
        found(isbn, { author: unique('Juhani Aho'), series: unique('Lastuja') }),
      )
      const input = inputFor(isbn)

      const first = await saveCopy(ctx, input)
      await trackCover(first.bookId)
      const asked = vi.mocked(lookupSources).mock.calls.length
      const again = await saveCopy(ctx, input)

      expect(again).toEqual(first)
      expect((await copiesOf(user)).map((copy) => copy.id)).toEqual([first.copyId])
      expect(lookupSources).toHaveBeenCalledTimes(asked)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('shares one save between concurrent repeats', async () => {
      const { user, ctx } = await freshUser()
      const isbn = randomIsbn()
      vi.mocked(lookupSources).mockResolvedValue(
        found(isbn, { author: unique('Eino Leino'), series: unique('Helkavirsiä') }),
      )
      const input = inputFor(isbn)

      const [a, b] = await Promise.all([saveCopy(ctx, input), saveCopy(ctx, input)])
      await trackCover(a.bookId)

      expect(b).toEqual(a)
      expect(await booksWithIsbn(isbn)).toHaveLength(1)
      expect((await copiesOf(user)).map((copy) => copy.id)).toEqual([a.copyId])
    })

    it("keeps each user's ids apart", async () => {
      const a = await freshUser()
      const b = await freshUser()
      const isbn = randomIsbn()
      await bookFor(undefined, isbn, 'shared')
      const input = inputFor(isbn)

      const ofA = await saveCopy(a.ctx, input)
      const ofB = await saveCopy(b.ctx, input)

      expect(ofB.copyId).not.toBe(ofA.copyId)
      expect((await copiesOf(b.user)).map((copy) => copy.id)).toEqual([ofB.copyId])
      expect((await copiesOf(a.user)).map((copy) => copy.id)).toEqual([ofA.copyId])
    })

    it('forgets a failed save, so a retry runs again', async () => {
      const { user, ctx } = await freshUser()
      const isbn = randomIsbn()
      vi.mocked(lookupSources).mockResolvedValue({ kind: 'none' })
      const input = inputFor(isbn)

      await expect(saveCopy(ctx, input)).rejects.toMatchObject(new DomainError('NOT_FOUND'))
      vi.mocked(lookupSources).mockResolvedValue(
        found(isbn, { author: unique('Maria Jotuni'), series: unique('Huojuva talo') }),
      )
      const retry = await saveCopy(ctx, input)
      await trackCover(retry.bookId)

      expect((await copiesOf(user)).map((copy) => copy.id)).toEqual([retry.copyId])
    })

    it('runs again once REQUEST_WINDOW_MS has passed', async () => {
      const { user, ctx } = await freshUser()
      const isbn = randomIsbn()
      await bookFor(undefined, isbn, 'shared')
      const input = inputFor(isbn)
      vi.useFakeTimers({ toFake: ['Date'] })
      try {
        const t0 = Date.now()
        const first = await saveCopy(ctx, input)
        vi.setSystemTime(t0 + REQUEST_WINDOW_MS)
        const later = await saveCopy(ctx, input)

        expect(later.copyId).not.toBe(first.copyId)
        expect(await copiesOf(user)).toHaveLength(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('forgets the oldest id past REQUEST_MEMORY_SIZE', async () => {
      const { ctx } = await freshUser()
      const ids = Array.from({ length: REQUEST_MEMORY_SIZE + 1 }, () => randomUUID())
      for (const [i, id] of ids.entries()) await oncePerRequest(ctx, id, async () => i)
      const run = vi.fn(async () => -1)

      expect(await oncePerRequest(ctx, ids.at(-1)!, run)).toBe(REQUEST_MEMORY_SIZE)
      expect(await oncePerRequest(ctx, ids[1]!, run)).toBe(1)
      expect(run).not.toHaveBeenCalled()
      expect(await oncePerRequest(ctx, ids[0]!, run)).toBe(-1)
      expect(run).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['empty', ''],
      ['65 characters', 'x'.repeat(65)],
    ])('rejects an %s requestId before any read', async (_, requestId) => {
      const { user, ctx } = await freshUser()
      const find = vi.spyOn(payload, 'find')

      await expect(saveCopy(ctx, { ...inputFor(randomIsbn()), requestId })).rejects.toMatchObject(
        new DomainError('VALIDATION'),
      )
      expect(find).not.toHaveBeenCalled()
      expect(lookupSources).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(await copiesOf(user)).toEqual([])
    })
  })
})
