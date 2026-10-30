import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { toNameKey } from '@/fields/nameKey'
import { mediaDir } from '@/lib/catalogue/covers'
import { type EntrySaveInput, saveCopy, saveEntry } from '@/lib/catalogue/saveCopy'
import { DomainError } from '@/lib/errors'
import { heldOutcome, lookupSources } from '@/lib/metadata/lookup'
import type { SourcesOutcome } from '@/lib/metadata/source'
import type { Ref } from '@/lib/payload/ref'
import { undo } from '@/lib/undo/undo'
import { createWishlist, deleteWishlist } from '@/lib/wishlists/wishlists'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `saveEntry()`, AD-11/AD-18/FR-21: Add to wishlist ensures the Book as
// `saveCopy()` does and puts it on a list as an open entry for the user, in
// one transaction. The sources are faked at `lookupSources`, the cover host
// at `fetch`. Rows are checked per user, ISBN and unique name: other files
// write in parallel.

vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn(), heldOutcome: vi.fn() }))

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

const COVER_URL = 'https://api.finna.fi/Cover/Show?source=Solr&id=x&index=0&size=large'

const found = (
  isbn13: string,
  names: { author: string; series: string },
): Extract<SourcesOutcome, { kind: 'found' }> => ({
  kind: 'found',
  failed: [],
  candidates: [
    {
      isbn13,
      title: 'Tuntematon sotilas',
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

const entryInput = (target: EntrySaveInput['target'], wishlist: Ref): EntrySaveInput => ({
  requestId: randomUUID(),
  target,
  save: { kind: 'entry', wishlist },
})

describe('saveEntry', () => {
  let payload: Payload
  let jpeg: Buffer
  const mediaIds: number[] = []
  const filenames: string[] = []

  const freshUser = async () => {
    const user = await createUser({ displayName: 'Save Entry User' })
    return { user, ctx: await contextFor(user) }
  }

  const find = async <C extends 'copies' | 'wishlist-entries' | 'wishlists'>(
    collection: C,
    user: User,
  ) =>
    (
      await payload.find({
        collection,
        where: { owner: { equals: user.id } },
        overrideAccess: true,
        depth: 0,
        pagination: false,
        sort: 'id',
      })
    ).docs

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

  const countByName = async (collection: 'authors' | 'series', name: string) =>
    (
      await payload.count({
        collection,
        where: { nameKey: { equals: toNameKey(name) } },
        overrideAccess: true,
      })
    ).totalDocs

  const sharedBook = async (isbn13: string) =>
    payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13, visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })

  /** The Book's cover row, recorded for cleanup. */
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
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg' } }),
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

  it('ensures the Book by ISBN, asking the sources only on a miss, and adds an open entry', async () => {
    const { user, ctx } = await freshUser()
    const listId = await createWishlist(ctx, unique('Kirjakauppa'))
    const list = await payload.findByID({ collection: 'wishlists', id: listId, depth: 0 })
    const isbn = randomIsbn()
    vi.mocked(lookupSources).mockResolvedValue(
      found(isbn, { author: unique('Väinö Linna'), series: unique('Sota') }),
    )

    const miss = await saveEntry(ctx, entryInput({ isbn13: isbn }, listId))
    await coverOf(miss.bookId)
    const held = randomIsbn()
    const existing = await sharedBook(held)
    const hit = await saveEntry(ctx, entryInput({ isbn13: held }, listId))

    expect(miss).toEqual({
      bookId: miss.bookId,
      entryId: expect.any(Number),
      savedTo: { id: listId, name: list.name },
      undoToken: expect.any(String),
      undoSeconds: expect.any(Number),
    })
    expect(await booksWithIsbn(isbn)).toMatchObject([{ id: miss.bookId, visibility: 'shared' }])
    expect(hit.bookId).toBe(existing.id)
    expect(lookupSources).toHaveBeenCalledTimes(1)
    const entries = await find('wishlist-entries', user)
    expect(
      entries.map((e) => [e.id, e.wishlist, e.book, e.forPerson ?? null, e.closedAt ?? null]),
    ).toEqual([
      [miss.entryId, listId, miss.bookId, null, null],
      [hit.entryId, listId, existing.id, null, null],
    ])
    expect(await find('copies', user)).toEqual([])
  })

  it('saves by id a Book held by a copy or only by an entry, never one not held', async () => {
    const { user, ctx } = await freshUser()
    const listId = await createWishlist(ctx, unique('Toiveet'))
    const byCopy = await sharedBook(randomIsbn())
    const byEntry = await sharedBook(randomIsbn())
    const notHeld = await sharedBook(randomIsbn())
    await saveCopy(ctx, {
      requestId: randomUUID(),
      target: { isbn13: byCopy.isbn13! },
      save: { kind: 'copy' },
    })
    await saveEntry(ctx, entryInput({ isbn13: byEntry.isbn13! }, listId))

    const a = await saveEntry(ctx, entryInput({ bookId: byCopy.id }, listId))
    const b = await saveEntry(ctx, entryInput({ bookId: byEntry.id }, listId))
    await expect(saveEntry(ctx, entryInput({ bookId: notHeld.id }, listId))).rejects.toMatchObject(
      new DomainError('NOT_FOUND'),
    )

    expect([a.bookId, b.bookId]).toEqual([byCopy.id, byEntry.id])
    expect((await find('wishlist-entries', user)).map((e) => e.book)).toEqual([
      byEntry.id,
      byCopy.id,
      byEntry.id,
    ])
    expect(await find('copies', user)).toHaveLength(1)
    expect(lookupSources).not.toHaveBeenCalled()
  })

  it('saves a manual target as a private Book on the list', async () => {
    const { user, ctx } = await freshUser()
    const listId = await createWishlist(ctx, unique('Käsin'))
    const title = unique('Kotiseutukirja')

    const result = await saveEntry(
      ctx,
      entryInput({ manual: { title, authors: [unique('Paikallinen kirjoittaja')] } }, listId),
    )

    const book = await payload.findByID({
      collection: 'books',
      id: result.bookId,
      overrideAccess: true,
      depth: 0,
    })
    expect(book).toMatchObject({ title, visibility: 'private', isbn13: null })
    expect((await find('wishlist-entries', user)).map((e) => e.book)).toEqual([result.bookId])
    expect(await find('copies', user)).toEqual([])
  })

  it('creates a list named by the Ref and reuses it for the same name in another case', async () => {
    const { user, ctx } = await freshUser()
    const isbn = randomIsbn()
    await sharedBook(isbn)

    const first = await saveEntry(ctx, entryInput({ isbn13: isbn }, { create: 'Joulu' }))
    const second = await saveEntry(ctx, entryInput({ isbn13: isbn }, { create: 'joulu' }))

    const lists = await find('wishlists', user)
    expect(lists.map((list) => [list.id, list.name])).toEqual([[first.savedTo.id, 'Joulu']])
    expect(second.savedTo).toEqual({ id: first.savedTo.id, name: 'Joulu' })
    expect((await find('wishlist-entries', user)).map((e) => e.wishlist)).toEqual([
      first.savedTo.id,
      first.savedTo.id,
    ])
  })

  it.each<[string, (other: number) => Ref]>([
    ["another user's list", (other) => other],
    ['a blank name', () => ({ create: '  ' })],
  ])('fails on %s with VALIDATION on wishlist, writing nothing', async (_, ref) => {
    const { user, ctx } = await freshUser()
    const b = await freshUser()
    const other = await createWishlist(b.ctx, unique('Vieras'))
    const isbn = randomIsbn()
    const names = { author: unique('Aino Kallas'), series: unique('Virolaiset') }
    vi.mocked(lookupSources).mockResolvedValue(found(isbn, names))

    await expect(saveEntry(ctx, entryInput({ isbn13: isbn }, ref(other)))).rejects.toMatchObject({
      code: 'VALIDATION',
      fields: { wishlist: 'VALIDATION' },
    })

    expect(await booksWithIsbn(isbn)).toEqual([])
    expect(await countByName('authors', names.author)).toBe(0)
    expect(await find('wishlist-entries', user)).toEqual([])
    expect(await find('wishlists', user)).toEqual([])
    expect(await find('wishlist-entries', b.user)).toEqual([])
  })

  it('returns the first result on a repeat, and keeps a copy save with the same id apart', async () => {
    const { user, ctx } = await freshUser()
    const listId = await createWishlist(ctx, unique('Kahdesti'))
    const isbn = randomIsbn()
    await sharedBook(isbn)
    const input = entryInput({ isbn13: isbn }, listId)

    const first = await saveEntry(ctx, input)
    const again = await saveEntry(ctx, input)
    const copy = await saveCopy(ctx, { ...input, save: { kind: 'copy' } })

    expect(again).toEqual({ ...first, undoSeconds: again.undoSeconds })
    expect((await find('wishlist-entries', user)).map((e) => e.id)).toEqual([first.entryId])
    expect((await find('copies', user)).map((c) => c.id)).toEqual([copy.copyId])
  })

  describe('undo', () => {
    it('deletes the entry and every row the save created, keeping the list', async () => {
      const { user, ctx } = await freshUser()
      const listId = await createWishlist(ctx, unique('Peruttava'))
      const isbn = randomIsbn()
      const names = { author: unique('Joel Lehtonen'), series: unique('Putkinotko') }
      vi.mocked(lookupSources).mockResolvedValue(found(isbn, names))

      const result = await saveEntry(ctx, entryInput({ isbn13: isbn }, listId))
      const media = await coverOf(result.bookId)

      await undo(ctx, result.undoToken)

      expect(await find('wishlist-entries', user)).toEqual([])
      expect(await booksWithIsbn(isbn)).toEqual([])
      expect(await countByName('authors', names.author)).toBe(0)
      expect(await countByName('series', names.series)).toBe(0)
      expect(
        (
          await payload.count({
            collection: 'media',
            where: { id: { equals: media.id } },
            overrideAccess: true,
          })
        ).totalDocs,
      ).toBe(0)
      expect((await find('wishlists', user)).map((list) => list.id)).toEqual([listId])
    })

    // AD-20: a restore skips rows that are gone, here the entry with its list.
    it('still deletes the rows the save created once the entry is gone', async () => {
      const { ctx } = await freshUser()
      const listId = await createWishlist(ctx, unique('Poistettava'))
      const isbn = randomIsbn()
      const names = { author: unique('Juhani Aho'), series: unique('Lastuja') }
      vi.mocked(lookupSources).mockResolvedValue(found(isbn, names))

      const result = await saveEntry(ctx, entryInput({ isbn13: isbn }, listId))
      const media = await coverOf(result.bookId)
      await deleteWishlist(ctx, listId)

      await expect(undo(ctx, result.undoToken)).resolves.toBeUndefined()

      expect(await booksWithIsbn(isbn)).toEqual([])
      expect(await countByName('authors', names.author)).toBe(0)
      expect(await countByName('series', names.series)).toBe(0)
      expect(
        (
          await payload.count({
            collection: 'media',
            where: { id: { equals: media.id } },
            overrideAccess: true,
          })
        ).totalDocs,
      ).toBe(0)
    })

    it('keeps a list the save created by name', async () => {
      const { user, ctx } = await freshUser()
      const isbn = randomIsbn()
      const book = await sharedBook(isbn)

      const result = await saveEntry(ctx, entryInput({ isbn13: isbn }, { create: unique('Uusi') }))
      await undo(ctx, result.undoToken)

      expect(await find('wishlist-entries', user)).toEqual([])
      expect((await find('wishlists', user)).map((list) => list.id)).toEqual([result.savedTo.id])
      expect((await booksWithIsbn(isbn)).map((b) => b.id)).toEqual([book.id])
    })
  })
})
