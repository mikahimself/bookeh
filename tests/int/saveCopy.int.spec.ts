import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
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
import { lookupBook } from '@/lib/catalogue/lookupBook'
import { LOOKUP_LIMIT, limitLookups } from '@/lib/catalogue/lookupLimit'
import { saveCopy, type SaveInput } from '@/lib/catalogue/saveCopy'
import {
  oncePerRequest,
  REQUEST_MEMORY_SIZE,
  REQUEST_WINDOW_MS,
} from '@/lib/catalogue/saveRequests'
import { DomainError, logger } from '@/lib/errors'
import { lendCopy } from '@/lib/loans/loans'
import { heldOutcome, lookupSources } from '@/lib/metadata/lookup'
import type { SourcesOutcome } from '@/lib/metadata/source'
import { undo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { Book, User, UserLocation } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'
import { rejectedPaths } from '../helpers/validation'

// `saveCopy()`, AD-11/FR-21: Add to library resolves the ISBN to a Book the
// user may hold, or ensures a shared one from the source outcome with its
// cover, and saves an owned copy at the default location in one transaction.
// The sources are faked at `lookupSources`, the cover host at `fetch`; the
// one-outcome test runs the real `lookupSources` with `fetch` faked instead.

vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn(), heldOutcome: vi.fn() }))

const FINNA_FIXTURE = readFileSync(
  new URL('../fixtures/finna/9780007466061.json', import.meta.url),
  'utf8',
)

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
      recordId: 'finna.1',
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
    vi.mocked(heldOutcome).mockReset()
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
    expect(media).toMatchObject({ visibility: 'shared', createdBy: null })
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
      undoToken: expect.any(String),
      undoSeconds: expect.any(Number),
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

  it('saves one more copy of a held Book by id, its Undo leaving the Book; never for another user', async () => {
    const { user, location, ctx } = await userWithDefault()
    const b = await freshUser()
    const isbn = randomIsbn()
    const shared = await bookFor(undefined, isbn, 'shared')
    const first = await saveCopy(ctx, inputFor(isbn))
    const byId = (bookId: number): SaveInput => ({
      requestId: randomUUID(),
      target: { bookId },
      save: { kind: 'copy' },
    })

    const result = await saveCopy(ctx, byId(shared.id))

    expect(result).toMatchObject({
      bookId: shared.id,
      savedTo: { id: location.id, name: location.name },
    })
    expect(result.copyId).not.toBe(first.copyId)
    const copies = (await copiesOf(user)).sort((x, y) => x.id - y.id)
    expect(copies.map((copy) => [copy.id, copy.book, copy.status, copy.location])).toEqual([
      [first.copyId, shared.id, 'owned', location.id],
      [result.copyId, shared.id, 'owned', location.id],
    ])

    await undo(ctx, result.undoToken)
    expect((await copiesOf(user)).map((copy) => copy.id)).toEqual([first.copyId])
    expect((await booksWithIsbn(isbn)).map((book) => book.id)).toEqual([shared.id])

    await expect(saveCopy(b.ctx, byId(shared.id))).rejects.toMatchObject(
      new DomainError('NOT_FOUND'),
    )
    expect(await copiesOf(b.user)).toEqual([])
    expect(lookupSources).not.toHaveBeenCalled()
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

  // AD-11: one outcome per save. Finna answers the recorded response under a
  // fresh ISBN, with a cover added to its second record; Google fails, so the
  // `found` is partial and held for PARTIAL_TTL_MS.
  it('saves the picked record from the outcome the Answer showed, asking Finna once', async () => {
    const actual =
      await vi.importActual<typeof import('@/lib/metadata/lookup')>('@/lib/metadata/lookup')
    vi.mocked(lookupSources).mockImplementation(actual.lookupSources)
    // Google's failure is logged.
    vi.spyOn(logger(), 'warn').mockImplementation(() => {})
    const { ctx } = await freshUser()
    const isbn = randomIsbn()
    const body = JSON.parse(
      FINNA_FIXTURE.replaceAll('9780007466061', isbn).replaceAll('978-0-00-746606-1', isbn),
    ) as { records: { id: string; images: string[] }[] }
    const second = body.records[1]!
    second.images = [`/Cover/Show?source=Solr&id=${second.id}&index=0&size=large`]
    const asked = { finna: 0, google: 0 }
    const covers: string[] = []
    fetchSpy.mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      if (url.hostname === 'www.googleapis.com') {
        asked.google++
        throw new TypeError('fetch failed')
      }
      if (url.pathname.endsWith('/v1/search')) {
        asked.finna++
        return Response.json(body)
      }
      covers.push(url.href)
      return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg' } })
    })

    const answer = await lookupBook(ctx, { isbn, pick: 1 })
    if (answer.kind !== 'source') throw new Error(`Expected a source answer, got ${answer.kind}`)
    const picked = answer.candidates[1]!
    const result = await saveCopy(ctx, {
      ...inputFor(isbn),
      target: {
        isbn13: isbn,
        pick: 1,
        candidate: { source: picked.source, recordId: picked.recordId },
      },
    })

    expect(asked).toEqual({ finna: 1, google: 1 })
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
    expect(book).toMatchObject({ isbn13: isbn, title: picked.title, visibility: 'shared' })
    expect(covers).toEqual([expect.stringContaining(`id=${picked.recordId}`)])
    expect(book.rawMetadata).toMatchObject({ coverUrl: covers[0] })
  })

  it('fails with NOT_FOUND when the candidate shown has gone, writing nothing', async () => {
    const { user, ctx } = await freshUser()
    const isbn = randomIsbn()
    const names = { author: unique('Pentti Haanpää'), series: unique('Korpi') }
    vi.mocked(lookupSources).mockResolvedValue(found(isbn, names))
    const before = await filesInMedia()

    await expect(
      saveCopy(ctx, {
        ...inputFor(isbn),
        target: { isbn13: isbn, pick: 0, candidate: { source: 'finna', recordId: 'finna.gone' } },
      }),
    ).rejects.toMatchObject(new DomainError('NOT_FOUND'))

    expect(lookupSources).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await filesInMedia()).toEqual(before)
    expect(await booksWithIsbn(isbn)).toEqual([])
    expect(await countByName('authors', names.author)).toBe(0)
    expect(await copiesOf(user)).toEqual([])
  })

  it('rolls back the Book, its records, the cover and the copy when the copy fails', async () => {
    const created = await createUser({ displayName: 'Save Copy Broken Default' })
    // A default that names no location: the copy insert is the failing write.
    const ctx = await contextFor({ ...created, defaultLocation: 2_000_000_000 })
    const isbn = randomIsbn()
    const names = { author: unique('Kalle Päätalo'), series: unique('Iijoki') }
    vi.mocked(lookupSources).mockResolvedValue(found(isbn, names))
    // The cover's final name, from `storeCover()`'s rename into place.
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

  // AD-9: only a save that asks the sources counts. The limit is in process,
  // so the test has its own user.
  it('counts a lookup only when no outcome is held, refusing past the limit', async () => {
    const { user, ctx } = await freshUser()
    for (let i = 0; i < LOOKUP_LIMIT; i++) limitLookups(ctx)
    const held = randomIsbn()
    const fresh = randomIsbn()
    const outcome = found(held, { author: unique('Juhani Aho'), series: unique('Lastuja') })
    vi.mocked(heldOutcome).mockImplementation((isbn13) => (isbn13 === held ? outcome : undefined))

    const saved = await saveCopy(ctx, inputFor(held))
    const book = await payload.findByID({
      collection: 'books',
      id: saved.bookId,
      overrideAccess: true,
      depth: 1,
    })
    if (typeof book.cover === 'object' && book.cover !== null) {
      mediaIds.push(book.cover.id)
      filenames.push(book.cover.filename!)
    }
    expect(book).toMatchObject({ isbn13: held, visibility: 'shared' })
    // A held Book never asks the sources, so it counts nothing either.
    const shelved = randomIsbn()
    const existing = await bookFor(undefined, shelved, 'shared')
    expect(await saveCopy(ctx, inputFor(shelved))).toMatchObject({ bookId: existing.id })

    const covers = fetchSpy.mock.calls.length
    await expect(saveCopy(ctx, inputFor(fresh))).rejects.toMatchObject(
      new DomainError('RATE_LIMITED'),
    )
    expect(lookupSources).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledTimes(covers)
    expect(await booksWithIsbn(fresh)).toEqual([])
    expect((await copiesOf(user)).map((copy) => copy.book).sort()).toEqual(
      [saved.bookId, existing.id].sort(),
    )
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

  // AD-11/AD-20: Undo deletes the copy and the rows the save created that
  // nothing references any more. Rows are checked by ISBN, unique name and id,
  // never by global counts: other files write in parallel.
  describe('undo', () => {
    const mediaCount = async (id: number) =>
      (
        await payload.count({
          collection: 'media',
          where: { id: { equals: id } },
          overrideAccess: true,
        })
      ).totalDocs

    /** The created Book's cover row, recorded for cleanup. */
    const coverOf = async (bookId: number) => {
      const book = await payload.findByID({
        collection: 'books',
        id: bookId,
        overrideAccess: true,
        depth: 1,
      })
      const media = book.cover
      if (typeof media !== 'object' || media === null) throw new Error('Book has no cover row')
      mediaIds.push(media.id)
      filenames.push(media.filename!)
      return media
    }

    it('deletes the copy and every row the save created', async () => {
      const { user, ctx } = await freshUser()
      const isbn = randomIsbn()
      const names = { author: unique('Volter Kilpi'), series: unique('Alastalon salissa') }
      vi.mocked(lookupSources).mockResolvedValue(found(isbn, names))

      const result = await saveCopy(ctx, inputFor(isbn))
      const media = await coverOf(result.bookId)
      expect(result.undoSeconds).toBeGreaterThan(0)

      await undo(ctx, result.undoToken)

      expect(await copiesOf(user)).toEqual([])
      expect(await booksWithIsbn(isbn)).toEqual([])
      expect(await countByName('authors', names.author)).toBe(0)
      expect(await countByName('series', names.series)).toBe(0)
      expect(await mediaCount(media.id)).toBe(0)
    })

    it('keeps the author and series the save matched rather than created', async () => {
      const { user, ctx } = await freshUser()
      const isbn = randomIsbn()
      const names = { author: unique('Juhani Aho'), series: unique('Lastuja') }
      const system = { overrideAccess: true, depth: 0 } as const
      await payload.create({
        collection: 'authors',
        data: { name: names.author, nameKey: '', visibility: 'shared' },
        ...system,
      })
      await payload.create({
        collection: 'series',
        data: { name: names.series, nameKey: '', visibility: 'shared' },
        ...system,
      })
      vi.mocked(lookupSources).mockResolvedValue(found(isbn, names))

      const result = await saveCopy(ctx, inputFor(isbn))
      await coverOf(result.bookId)
      await undo(ctx, result.undoToken)

      expect(await copiesOf(user)).toEqual([])
      expect(await booksWithIsbn(isbn)).toEqual([])
      expect(await countByName('authors', names.author)).toBe(1)
      expect(await countByName('series', names.series)).toBe(1)
    })

    it('keeps a created Book and its rows that another user holds', async () => {
      const a = await freshUser()
      const b = await freshUser()
      const isbn = randomIsbn()
      const names = { author: unique('Joel Lehtonen'), series: unique('Putkinotko') }
      vi.mocked(lookupSources).mockResolvedValue(found(isbn, names))

      const ofA = await saveCopy(a.ctx, inputFor(isbn))
      const media = await coverOf(ofA.bookId)
      const ofB = await saveCopy(b.ctx, inputFor(isbn))
      expect(ofB.bookId).toBe(ofA.bookId)

      await undo(a.ctx, ofA.undoToken)

      expect(await copiesOf(a.user)).toEqual([])
      expect((await booksWithIsbn(isbn)).map((book) => book.id)).toEqual([ofA.bookId])
      expect(await countByName('authors', names.author)).toBe(1)
      expect(await countByName('series', names.series)).toBe(1)
      expect(await mediaCount(media.id)).toBe(1)
      expect((await copiesOf(b.user)).map((copy) => copy.id)).toEqual([ofB.copyId])
    })

    it('fails with UNDO_FAILED once the copy is lent, keeping the copy, Book and loan', async () => {
      const { user, ctx } = await freshUser()
      const isbn = randomIsbn()
      const names = { author: unique('Minna Canth'), series: unique('Työmiehen vaimo') }
      vi.mocked(lookupSources).mockResolvedValue(found(isbn, names))

      const result = await saveCopy(ctx, inputFor(isbn))
      await coverOf(result.bookId)
      const { data } = await lendCopy(ctx, result.copyId, { create: 'Liisa' })
      // The explicit check, not the `loans.copy_id` foreign key, refuses it; afterEach restores the spy.
      const warn = vi.spyOn(logger(), 'warn').mockImplementation(() => {})

      await expect(undo(ctx, result.undoToken)).rejects.toMatchObject({ code: 'UNDO_FAILED' })
      const { err } = warn.mock.calls[0]?.[0] as { err: unknown }
      expect(err).toBeInstanceOf(DomainError)
      expect(err).toMatchObject({ code: 'UNDO_FAILED' })

      expect((await copiesOf(user)).map((copy) => copy.id)).toEqual([result.copyId])
      expect((await booksWithIsbn(isbn)).map((book) => book.id)).toEqual([result.bookId])
      const loan = await payload.findByID({ collection: 'loans', id: data.loanId, depth: 0 })
      expect(loan.copy).toBe(result.copyId)
      expect(loan.returnedOn ?? null).toBeNull()
    })

    it('keeps a Book that existed before the save, even unreferenced', async () => {
      const { user, ctx } = await freshUser()
      const isbn = randomIsbn()
      const shared = await bookFor(undefined, isbn, 'shared')

      const result = await saveCopy(ctx, inputFor(isbn))
      await undo(ctx, result.undoToken)

      expect(await copiesOf(user)).toEqual([])
      expect((await booksWithIsbn(isbn)).map((book) => book.id)).toEqual([shared.id])
    })

    it('returns the same token with fewer seconds on a repeat, and its Undo removes the copy', async () => {
      const { user, ctx } = await freshUser()
      const isbn = randomIsbn()
      await bookFor(undefined, isbn, 'shared')
      const input = inputFor(isbn)
      let first: Awaited<ReturnType<typeof saveCopy>>
      let again: Awaited<ReturnType<typeof saveCopy>>
      vi.useFakeTimers({ toFake: ['Date'] })
      try {
        const t0 = Date.now()
        first = await saveCopy(ctx, input)
        vi.setSystemTime(t0 + 60_000)
        again = await saveCopy(ctx, input)
      } finally {
        vi.useRealTimers()
      }

      expect(again.undoToken).toBe(first.undoToken)
      expect(again.undoSeconds).toBe(first.undoSeconds - 60)
      expect(again.copyId).toBe(first.copyId)

      await undo(ctx, again.undoToken)
      expect(await copiesOf(user)).toEqual([])
    })
  })
})
