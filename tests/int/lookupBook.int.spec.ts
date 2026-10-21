import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { toNameKey } from '@/fields/nameKey'
import { normaliseName } from '@/fields/sortName'
import type { Named } from '@/lib/books/effectiveBook'
import { findOrCreateByName } from '@/lib/catalogue/findOrCreateByName'
import { lookupBook } from '@/lib/catalogue/lookupBook'
import { LOOKUP_LIMIT, LOOKUP_WINDOW_MS } from '@/lib/catalogue/lookupLimit'
import { DomainError } from '@/lib/errors'
import { lookupSources } from '@/lib/metadata/lookup'
import type { SourceResult } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, Copy, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { hyphenatedIsbn10, randomIsbn } from '../helpers/isbn'

// `lookupBook()`, AD-9/FR-11: the ISBN as entered answers a shared Book, the
// viewer's own private Book, or what the sources know; another user's private
// Book is never returned, the admin included; nothing is written. The sources
// are faked at the service's dependency, so no cache or adapter is involved.

vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn() }))

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

// Shared names are global across runs, so the default author is run-unique
// and matches no row unless a test seeds it.
const defaultAuthor = unique('Väinö Linna')

const candidate = (isbn13: string, title: string, extra: Partial<SourceResult> = {}): SourceResult => ({
  isbn13,
  title,
  authors: [{ name: defaultAuthor }],
  subjects: [],
  themes: [],
  source: 'finna',
  recordId: `finna.${title}`,
  raw: { finna: { title } },
  ...extra,
})

describe('lookupBook', () => {
  let payload: Payload
  let a: User
  let asA: Context
  let asB: Context
  let asAdmin: Context
  let x: Book
  let p: Book
  let q: Book
  let sharedTwin: Book
  let shelf: Named
  let copyOfX: Copy

  /** A system write, as `lib/catalogue` makes it, with `user` on the request. */
  const systemBook = async (user: User, visibility: Book['visibility'], isbn13 = randomIsbn()) =>
    payload.create({
      collection: 'books',
      data: { title: 'Tuntematon sotilas', isbn13, visibility },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const booksWithIsbn = async (isbn13: string) =>
    (await payload.count({ collection: 'books', where: { isbn13: { equals: isbn13 } } })).totalDocs

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Lookup User A' })
    const b = await createUser({ displayName: 'Lookup User B' })
    const admin = await createUser({ displayName: 'Lookup Admin', roles: ['admin'] })
    asA = await contextFor(a)
    asB = await contextFor(b)
    asAdmin = await contextFor(admin)

    x = await systemBook(a, 'shared')
    p = await systemBook(a, 'private')
    // The private row is the newer one, so the preference is not the default sort.
    const twinIsbn = randomIsbn()
    sharedTwin = await systemBook(a, 'shared', twinIsbn)
    q = await systemBook(a, 'private', twinIsbn)

    const location = await gateway.create(asA, {
      collection: 'locations',
      data: { owner: a.id, name: unique('Hylly'), nameKey: 'ignored' },
      depth: 0,
    })
    shelf = { id: location.id, name: location.name }
    copyOfX = await gateway.create(asA, {
      collection: 'copies',
      data: { owner: a.id, book: x.id, status: 'owned', location: shelf.id },
      depth: 0,
    })
  })

  beforeEach(() => {
    vi.mocked(lookupSources).mockReset()
  })

  it('rejects an invalid ISBN before asking anything', async () => {
    await expect(lookupBook(asA, { isbn: '12345' })).rejects.toMatchObject(
      new DomainError('INVALID_ISBN'),
    )
    expect(lookupSources).not.toHaveBeenCalled()
  })

  it('answers a shared Book, with the viewer’s copy, from the ISBN as entered', async () => {
    const result = await lookupBook(asA, { isbn: hyphenatedIsbn10(x.isbn13!) })
    expect(result).toMatchObject({
      kind: 'existing',
      book: { bookId: x.id, isbn13: x.isbn13, visibility: 'shared', title: 'Tuntematon sotilas' },
      mine: {
        copies: [{ copyId: copyOfX.id, status: 'owned', location: shelf, note: null, loan: null }],
        entries: [],
      },
    })
    expect(result).not.toHaveProperty('book.rawMetadata')
    expect(lookupSources).not.toHaveBeenCalled()
  })

  it('answers the viewer’s own private Book and warms the sources', async () => {
    vi.mocked(lookupSources).mockResolvedValue({ kind: 'none' })
    const result = await lookupBook(asA, { isbn: p.isbn13! })
    expect(result).toMatchObject({
      kind: 'existing',
      book: { bookId: p.id, visibility: 'private' },
      mine: { copies: [], entries: [] },
    })
    expect(lookupSources).toHaveBeenCalledTimes(1)
    expect(lookupSources).toHaveBeenCalledWith(p.isbn13)
  })

  it('never answers another user’s private Book, not even to the admin', async () => {
    vi.mocked(lookupSources).mockResolvedValue({ kind: 'none' })
    expect(await lookupBook(asB, { isbn: p.isbn13! })).toEqual({ kind: 'none' })
    expect(await lookupBook(asAdmin, { isbn: p.isbn13! })).toEqual({ kind: 'none' })
  })

  it('prefers the shared Book over the viewer’s private one with the same ISBN', async () => {
    const result = await lookupBook(asA, { isbn: q.isbn13! })
    expect(result).toMatchObject({
      kind: 'existing',
      book: { bookId: sharedTwin.id, visibility: 'shared' },
    })
    expect(lookupSources).not.toHaveBeenCalled()
  })

  describe('with no readable Book', () => {
    const isbn = randomIsbn()

    it('maps found candidates to drafts and keeps a valid pick', async () => {
      vi.mocked(lookupSources).mockResolvedValue({
        kind: 'found',
        candidates: [
          candidate(isbn, 'First', { coverUrl: 'https://covers.example/first.jpg' }),
          candidate(isbn, 'Second', { source: 'google', raw: { google: {} } }),
        ],
        raw: { v: 1, fetchedAt: '2026-10-19T00:00:00.000Z', sources: {}, subjects: {}, coverUrl: null },
      })
      const result = await lookupBook(asA, { isbn, pick: 1 })
      const { raw: _first, ...first } = candidate(isbn, 'First')
      const { raw: _second, ...second } = candidate(isbn, 'Second', { source: 'google' })
      expect(result).toEqual({
        kind: 'source',
        pick: 1,
        candidates: [
          { ...first, hasCover: true },
          { ...second, hasCover: false },
        ],
        matches: { authors: [{ name: defaultAuthor, id: null }], series: null },
      })
      if (result.kind !== 'source') throw new Error('unreachable')
      for (const draft of result.candidates) {
        expect(draft).not.toHaveProperty('raw')
        expect(draft).not.toHaveProperty('coverUrl')
      }
      expect(lookupSources).toHaveBeenCalledWith(isbn)
      expect(await booksWithIsbn(isbn)).toBe(0)
    })

    it.each([5, -1, 0.5, undefined])('falls back to the best candidate for pick %s', async (pick) => {
      vi.mocked(lookupSources).mockResolvedValue({
        kind: 'found',
        candidates: [candidate(isbn, 'First'), candidate(isbn, 'Second')],
        raw: { v: 1, fetchedAt: '2026-10-19T00:00:00.000Z', sources: {}, subjects: {}, coverUrl: null },
      })
      expect(await lookupBook(asA, { isbn, pick })).toMatchObject({ kind: 'source', pick: 0 })
    })

    it('passes none and unavailable through', async () => {
      vi.mocked(lookupSources).mockResolvedValue({ kind: 'none' })
      expect(await lookupBook(asA, { isbn })).toEqual({ kind: 'none' })
      vi.mocked(lookupSources).mockResolvedValue({ kind: 'unavailable', failed: ['finna'] })
      expect(await lookupBook(asA, { isbn })).toEqual({ kind: 'unavailable', failed: ['finna'] })
      expect(await booksWithIsbn(isbn)).toBe(0)
    })
  })

  describe('matches', () => {
    const isbn = randomIsbn()
    const found = (...candidates: SourceResult[]) =>
      vi.mocked(lookupSources).mockResolvedValue({
        kind: 'found',
        candidates,
        raw: { v: 1, fetchedAt: '2026-10-19T00:00:00.000Z', sources: {}, subjects: {}, coverUrl: null },
      })

    const rowsWithName = async (collection: 'authors' | 'series', name: string) =>
      (
        await payload.count({
          collection,
          where: { nameKey: { equals: toNameKey(normaliseName(name)) } },
          overrideAccess: true,
        })
      ).totalDocs

    const matchesOf = async (target: { isbn: string; pick?: number }) => {
      const result = await lookupBook(asA, target)
      if (result.kind !== 'source') throw new Error(`expected a source answer, got ${result.kind}`)
      return result.matches
    }

    it('links an existing shared author and series, case and spacing aside', async () => {
      const author = unique('Tove Jansson')
      const seriesName = unique('Muumi')
      const sharedAuthor = await findOrCreateByName(asB, 'authors', 'shared', { name: author })
      const sharedSeries = await findOrCreateByName(asB, 'series', 'shared', { name: seriesName })
      const given = ` ${author.replace('Tove Jansson', 'tove  JANSSON')} `
      found(candidate(isbn, 'Muumipeikko', { authors: [{ name: given }], series: seriesName.toUpperCase() }))

      expect(await matchesOf({ isbn })).toEqual({
        // Shown normalised, as a save stores it.
        authors: [{ name: author.replace('Tove Jansson', 'tove JANSSON'), id: sharedAuthor.id }],
        series: { name: seriesName.toUpperCase(), id: sharedSeries.id },
      })
    })

    it('marks unknown authors and series as new and creates nothing', async () => {
      const first = unique('Uusi Kirjailija')
      const second = unique('Toinen Kirjailija')
      const seriesName = unique('Uusi sarja')
      found(
        candidate(isbn, 'Uutuus', {
          authors: [{ name: first }, { name: second, sortName: 'Kirjailija, Toinen' }],
          series: seriesName,
        }),
      )

      expect(await matchesOf({ isbn })).toEqual({
        authors: [
          { name: first, id: null },
          { name: second, id: null },
        ],
        series: { name: seriesName, id: null },
      })
      expect(await rowsWithName('authors', first)).toBe(0)
      expect(await rowsWithName('authors', second)).toBe(0)
      expect(await rowsWithName('series', seriesName)).toBe(0)
      expect(await booksWithIsbn(isbn)).toBe(0)
    })

    it('ignores the viewer’s and other users’ private authors', async () => {
      const author = unique('Yksityinen Kirjailija')
      await findOrCreateByName(asA, 'authors', 'private', { name: author })
      await findOrCreateByName(asB, 'authors', 'private', { name: author })
      found(candidate(isbn, 'Yksityinen', { authors: [{ name: author }] }))

      expect(await matchesOf({ isbn })).toEqual({ authors: [{ name: author, id: null }], series: null })
      expect(await rowsWithName('authors', author)).toBe(2)
    })

    it('follows the picked candidate', async () => {
      const other = unique('Toisen Painoksen Kirjailija')
      found(candidate(isbn, 'First'), candidate(isbn, 'Second', { authors: [{ name: other }] }))

      expect(await matchesOf({ isbn, pick: 1 })).toEqual({
        authors: [{ name: other, id: null }],
        series: null,
      })
    })
  })

  // Own users: the counter is in process and shared by every test in the run.
  it('limits each user to LOOKUP_LIMIT lookups per window, then resets', async () => {
    const asC = await contextFor(await createUser({ displayName: 'Lookup User C' }))
    const asD = await contextFor(await createUser({ displayName: 'Lookup User D' }))
    const isbn = randomIsbn()
    vi.mocked(lookupSources).mockResolvedValue({ kind: 'none' })
    vi.useFakeTimers({ toFake: ['Date'] })
    const t0 = Date.now()
    try {
      for (let i = 0; i < LOOKUP_LIMIT; i++) {
        expect(await lookupBook(asC, { isbn })).toEqual({ kind: 'none' })
      }
      // Refused at the window's last instant: it must not move the reset.
      vi.setSystemTime(t0 + LOOKUP_WINDOW_MS - 1)
      await expect(lookupBook(asC, { isbn })).rejects.toMatchObject(new DomainError('RATE_LIMITED'))
      expect(lookupSources).toHaveBeenCalledTimes(LOOKUP_LIMIT)

      expect(await lookupBook(asD, { isbn })).toEqual({ kind: 'none' })
      await expect(lookupBook(asC, { isbn: '12345' })).rejects.toMatchObject(
        new DomainError('INVALID_ISBN'),
      )

      vi.setSystemTime(t0 + LOOKUP_WINDOW_MS)
      expect(await lookupBook(asC, { isbn })).toEqual({ kind: 'none' })
    } finally {
      vi.useRealTimers()
    }
  })
})
