import fs from 'node:fs/promises'
import path from 'node:path'

import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { attachCover, mediaDir } from '@/lib/catalogue/covers'
import { findOrCreateByName } from '@/lib/catalogue/findOrCreateByName'
import { LOOKUP_LIMIT, limitLookups } from '@/lib/catalogue/lookupLimit'
import { refetchBook } from '@/lib/catalogue/refetchBook'
import { DomainError } from '@/lib/errors'
import { lookupSources } from '@/lib/metadata/lookup'
import type { SourceResult, SourcesOutcome } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `refetchBook()`, AD-5/FR-19: the admin's re-fetch fills only the empty
// fields of a shared Book from a fresh lookup and never touches `user-books`.
// The sources are faked at `lookupSources`, the cover host at `fetch`.

vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn() }))

const COVER_URL = 'https://api.finna.fi/Cover/Show?source=Solr&id=x&index=0&size=large'

const found = (isbn13: string, extra: Partial<SourceResult>): SourcesOutcome => ({
  kind: 'found',
  failed: [],
  candidates: [
    {
      isbn13,
      title: 'Muumipeikko ja pyrstötähti',
      authors: [{ name: 'Tove Jansson' }],
      subjects: [],
      themes: [],
      source: 'finna',
      recordId: 'finna.1',
      raw: { finna: {} },
      ...extra,
    },
  ],
  raw: { v: 1, fetchedAt: '2026-10-23T00:00:00.000Z', sources: {}, subjects: {}, coverUrl: null },
})

describe('refetchBook', () => {
  let payload: Payload
  let admin: User
  let asAdmin: Context
  let jpeg: Buffer
  const mediaIds: number[] = []

  const bookOf = (id: number) =>
    payload.findByID({ collection: 'books', id, depth: 0, overrideAccess: true })

  const heldBook = async (
    user: User,
    visibility: Book['visibility'],
    data: Partial<Book> = {},
  ): Promise<Book> => {
    const req = (await contextFor(user)).req
    const book = await payload.create({
      collection: 'books',
      data: { title: 'Muumipeikko ja pyrstötähti', isbn13: randomIsbn(), visibility, ...data },
      overrideAccess: true,
      depth: 0,
      req,
    })
    await payload.create({
      collection: 'copies',
      data: { owner: user.id, book: book.id, status: 'owned' },
      overrideAccess: true,
      depth: 0,
      req,
    })
    return book
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    admin = await createUser({ displayName: 'Refetch Admin', roles: ['admin', 'user'] })
    asAdmin = await contextFor(admin)
    jpeg = await sharp({
      create: { width: 4, height: 6, channels: 3, background: { r: 20, g: 90, b: 160 } },
    })
      .jpeg()
      .toBuffer()
  })

  beforeEach(() => {
    vi.mocked(lookupSources).mockReset()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg' } }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    for (const id of mediaIds) {
      const row = await payload
        .findByID({ collection: 'media', id, overrideAccess: true, depth: 0 })
        .catch(() => undefined)
      await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => undefined)
      if (row?.filename) await fs.rm(path.join(mediaDir(payload), row.filename), { force: true })
    }
  })

  it('fills only the empty fields, cover and themes included, and leaves user-books alone', async () => {
    const author = await findOrCreateByName(asAdmin, 'authors', 'shared', { name: 'Tove Jansson' })
    const book = await heldBook(admin, 'shared', {
      authors: [author.id],
      publisher: 'WSOY',
      year: 1946,
    })
    const row = await payload.create({
      collection: 'user-books',
      data: { owner: admin.id, book: book.id, publisher: 'Oma', overridden: ['publisher'] },
      overrideAccess: true,
      depth: 0,
      req: asAdmin.req,
    })
    vi.mocked(lookupSources).mockResolvedValue(
      found(book.isbn13!, {
        publisher: 'Otava',
        year: 2010,
        pages: 180,
        coverUrl: COVER_URL,
        themes: ['komeetat', 'muumit'],
      }),
    )

    const result = await refetchBook(asAdmin, book.id)

    expect(result).toEqual({
      kind: 'filled',
      fields: ['pages', 'cover', 'themes'],
      themes: 2,
      source: 'finna',
    })
    expect(lookupSources).toHaveBeenCalledWith(book.isbn13, { fresh: true })
    const after = await bookOf(book.id)
    expect(after).toMatchObject({
      publisher: 'WSOY',
      year: 1946,
      pages: 180,
      themes: ['komeetat', 'muumit'],
      authors: [author.id],
      source: 'finna',
      rawMetadata: expect.objectContaining({ v: 1 }),
    })
    expect(after.cover).toEqual(expect.any(Number))
    mediaIds.push(after.cover as number)
    expect(
      await payload.findByID({
        collection: 'user-books',
        id: row.id,
        depth: 0,
        overrideAccess: true,
      }),
    ).toEqual(row)
  })

  // AD-4: a shared Book's authors and series are shared rows, matched before created.
  it('fills empty authors and series among shared records, and the index with its series', async () => {
    const tag = randomIsbn()
    const known = await findOrCreateByName(asAdmin, 'authors', 'shared', { name: `Aho ${tag}` })
    const book = await heldBook(admin, 'shared', { publisher: 'WSOY' })
    vi.mocked(lookupSources).mockResolvedValue(
      found(book.isbn13!, {
        authors: [{ name: `Aho ${tag}` }, { name: `Canth ${tag}` }],
        series: `Lastuja ${tag}`,
        seriesIndex: 3,
      }),
    )

    const result = await refetchBook(asAdmin, book.id)

    expect(result).toMatchObject({ kind: 'filled', fields: ['authors', 'series', 'seriesIndex'] })
    const after = await bookOf(book.id)
    const [first, second] = after.authors as number[]
    expect(first).toBe(known.id)
    for (const [collection, id] of [
      ['authors', second],
      ['series', after.series as number],
    ] as const) {
      expect(
        await payload.findByID({ collection, id, depth: 0, overrideAccess: true }),
      ).toMatchObject({ visibility: 'shared' })
    }
    expect(after.seriesIndex).toBe(3)
  })

  it('leaves the index empty when the Book has another series', async () => {
    const tag = randomIsbn()
    const own = await findOrCreateByName(asAdmin, 'series', 'shared', { name: `Oma ${tag}` })
    const book = await heldBook(admin, 'shared', { series: own.id })
    vi.mocked(lookupSources).mockResolvedValue(
      found(book.isbn13!, { authors: [], series: `Muu ${tag}`, seriesIndex: 3, pages: 99 }),
    )

    expect(await refetchBook(asAdmin, book.id)).toMatchObject({ fields: ['pages'] })
    expect(await bookOf(book.id)).toMatchObject({ series: own.id, seriesIndex: null })
  })

  // AD-9: re-fetch shares the per-user lookup limit. The limit is in process,
  // so the test has its own admin.
  it('refuses past the lookup limit before asking the sources', async () => {
    const limited = await createUser({ displayName: 'Limited Admin', roles: ['admin', 'user'] })
    const ctx = await contextFor(limited)
    const book = await heldBook(limited, 'shared')
    for (let i = 0; i < LOOKUP_LIMIT; i++) limitLookups(ctx)

    await expect(refetchBook(ctx, book.id)).rejects.toMatchObject(new DomainError('RATE_LIMITED'))
    expect(lookupSources).not.toHaveBeenCalled()
    expect(await bookOf(book.id)).toEqual(book)
  })

  it('keeps an uploaded cover and a set publisher when the source differs', async () => {
    const cover = await attachCover(
      asAdmin,
      { filename: 'uploaded.jpg', mimeType: 'image/jpeg', filesize: 1, width: 2, height: 3 },
      'shared',
    )
    mediaIds.push(cover)
    const book = await heldBook(admin, 'shared', { cover, publisher: 'WSOY' })
    vi.mocked(lookupSources).mockResolvedValue(
      found(book.isbn13!, { authors: [], publisher: 'Otava', coverUrl: COVER_URL, pages: 180 }),
    )

    const result = await refetchBook(asAdmin, book.id)

    expect(result).toMatchObject({ kind: 'filled', fields: ['pages'] })
    expect(await bookOf(book.id)).toMatchObject({ cover, publisher: 'WSOY', pages: 180 })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('answers nothing and writes nothing when every field is set', async () => {
    const book = await heldBook(admin, 'shared', { publisher: 'WSOY', pages: 160 })
    vi.mocked(lookupSources).mockResolvedValue(
      found(book.isbn13!, { authors: [], publisher: 'Otava', pages: 180 }),
    )

    expect(await refetchBook(asAdmin, book.id)).toEqual({ kind: 'nothing' })
    expect(await bookOf(book.id)).toEqual(book)
  })

  it('answers unavailable with the failed sources and writes nothing', async () => {
    const book = await heldBook(admin, 'shared')
    vi.mocked(lookupSources).mockResolvedValue({ kind: 'unavailable', failed: ['finna', 'google'] })

    expect(await refetchBook(asAdmin, book.id)).toEqual({
      kind: 'unavailable',
      failed: ['finna', 'google'],
    })
    expect(await bookOf(book.id)).toEqual(book)
  })

  it('refuses a user on a shared Book and the admin on their private Book, before any source call', async () => {
    const user = await createUser({ displayName: 'Refetch User' })
    const shared = await heldBook(user, 'shared')
    const own = await heldBook(admin, 'private')

    for (const [ctx, book] of [
      [await contextFor(user), shared],
      [asAdmin, own],
    ] as const) {
      await expect(refetchBook(ctx, book.id)).rejects.toMatchObject(new DomainError('NOT_FOUND'))
      expect(await bookOf(book.id)).toEqual(book)
    }
    expect(lookupSources).not.toHaveBeenCalled()
  })
})
