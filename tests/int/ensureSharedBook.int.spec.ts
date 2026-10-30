import { randomUUID } from 'node:crypto'

import { getPayload, ValidationError, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { toNameKey } from '@/fields/nameKey'
import { ensureSharedBook } from '@/lib/catalogue/ensureSharedBook'
import { findOrCreateByName } from '@/lib/catalogue/findOrCreateByName'
import { chooseCandidate } from '@/lib/catalogue/pick'
import { DomainError } from '@/lib/errors'
import type { RawMetadata, SourceResult, SourcesOutcome } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import { withTransaction } from '@/lib/payload/transaction'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `ensureSharedBook()`, AD-5/FR-18: the shared Book for an ISBN, created from
// the candidate the save chose (`chooseCandidate()`) with shared authors and
// series, or returned as it is. It asks no source: the save resolved the
// outcome before (AD-11), so the tests hand it one.

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

const raw = (title: string): RawMetadata => ({
  v: 1,
  fetchedAt: '2026-10-19T00:00:00.000Z',
  sources: { finna: { title } },
  subjects: { google: ['Fiction'] },
  coverUrl: null,
})

const candidate = (
  isbn13: string,
  title: string,
  extra: Partial<SourceResult> = {},
): SourceResult => ({
  isbn13,
  title,
  authors: [{ name: unique('Väinö Linna') }],
  subjects: [],
  themes: [],
  source: 'finna',
  recordId: `finna.${title}`,
  raw: { finna: { title } },
  ...extra,
})

const found = (...candidates: SourceResult[]): Extract<SourcesOutcome, { kind: 'found' }> => ({
  kind: 'found',
  failed: [],
  candidates,
  raw: raw(candidates[0]!.title),
})

/** The best candidate of an outcome holding `candidates`, as a save chooses it. */
const chosen = (...candidates: SourceResult[]) => chooseCandidate(found(...candidates))

describe('ensureSharedBook', () => {
  let payload: Payload
  let a: User
  let asA: Context
  let asB: Context

  const booksWithIsbn = async (isbn13: string) =>
    payload.find({
      collection: 'books',
      where: { isbn13: { equals: isbn13 } },
      overrideAccess: true,
      depth: 0,
      pagination: false,
    })

  const countByName = async (collection: 'authors' | 'series', name: string) =>
    (
      await payload.count({
        collection,
        where: { nameKey: { equals: toNameKey(name) } },
        overrideAccess: true,
      })
    ).totalDocs

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Ensure User A' })
    const b = await createUser({ displayName: 'Ensure User B' })
    asA = await contextFor(a)
    asB = await contextFor(b)
  })

  it('creates a shared Book from the chosen candidate with shared authors and series', async () => {
    const isbn = randomIsbn()
    const existingName = unique('Tove Jansson')
    const existing = await findOrCreateByName(asA, 'authors', 'shared', {
      name: existingName.toUpperCase(),
    })
    const newName = unique('Arto Paasilinna')
    const privateOfA = await findOrCreateByName(asA, 'authors', 'private', { name: newName })
    const seriesName = unique('Muumit')
    const best = candidate(isbn, 'Muumipeikko ja pyrstötähti', {
      subtitle: 'Romaani',
      authors: [
        { name: existingName },
        { name: newName, sortName: 'Paasilinna, Arto' },
        // A case variant matches the same shared row: its id is kept once.
        { name: newName.toUpperCase() },
      ],
      series: seriesName,
      seriesIndex: 2,
      publisher: 'WSOY',
      year: 1968,
      language: 'fi',
      pages: 180,
      description: 'Komeetta lähestyy.',
      themes: ['komeetat', 'ystävyys'],
      binding: 'hardcover',
      coverUrl: 'https://covers.example/muumi.jpg',
    })
    const outcome = found(best, candidate(isbn, 'Second', { source: 'google' }))

    const { data: result } = await ensureSharedBook(asA, isbn, chooseCandidate(outcome))
    expect(result.created).toBe(true)

    const book = await payload.findByID({
      collection: 'books',
      id: result.id,
      overrideAccess: true,
      depth: 0,
    })
    expect(book).toMatchObject({
      isbn13: isbn,
      title: 'Muumipeikko ja pyrstötähti',
      subtitle: 'Romaani',
      seriesIndex: 2,
      publisher: 'WSOY',
      year: 1968,
      language: 'fi',
      pages: 180,
      description: 'Komeetta lähestyy.',
      themes: ['komeetat', 'ystävyys'],
      source: 'finna',
      visibility: 'shared',
    })
    // The record names the cover of the candidate the Book was made from.
    expect(book.rawMetadata).toEqual({
      ...outcome.raw,
      coverUrl: 'https://covers.example/muumi.jpg',
    })
    expect(book.createdBy ?? null).toBeNull()
    expect(book.genres ?? []).toEqual([])

    expect(book.authors).toHaveLength(2)
    const [first, second] = book.authors as number[]
    expect(first).toBe(existing.id)
    expect(second).not.toBe(privateOfA.id)
    const created = await payload.findByID({
      collection: 'authors',
      id: second!,
      overrideAccess: true,
      depth: 0,
    })
    expect(created).toMatchObject({
      name: newName,
      sortName: 'Paasilinna, Arto',
      visibility: 'shared',
    })

    const series = await payload.findByID({
      collection: 'series',
      id: book.series as number,
      overrideAccess: true,
      depth: 0,
    })
    expect(series).toMatchObject({ name: seriesName, visibility: 'shared' })
  })

  it('returns an existing shared Book as it is', async () => {
    const isbn = randomIsbn()
    const existing = await payload.create({
      collection: 'books',
      data: { title: 'Tuntematon sotilas', isbn13: isbn, visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })
    const hyphenated = `${isbn.slice(0, 3)}-${isbn.slice(3, 5)}-${isbn.slice(5, 9)}-${isbn.slice(9, 12)}-${isbn.slice(12)}`
    expect(
      (await ensureSharedBook(asA, hyphenated, chosen(candidate(isbn, 'Other')))).data,
    ).toEqual({ id: existing.id, created: false })
    expect((await booksWithIsbn(isbn)).totalDocs).toBe(1)
  })

  it('creates a shared Book beside the caller’s private Book with the ISBN', async () => {
    const isbn = randomIsbn()
    const privateBook = await payload.create({
      collection: 'books',
      data: { title: 'Oma kirja', isbn13: isbn, visibility: 'private' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(a)).req,
    })
    const { data: result } = await ensureSharedBook(
      asA,
      isbn,
      chosen(candidate(isbn, 'Lähteen kirja')),
    )
    expect(result.created).toBe(true)
    expect(result.id).not.toBe(privateBook.id)
    const book = await payload.findByID({
      collection: 'books',
      id: result.id,
      overrideAccess: true,
      depth: 0,
    })
    expect(book.visibility).toBe('shared')
  })

  it('rejects an invalid ISBN', async () => {
    await expect(
      ensureSharedBook(asA, '12345', chosen(candidate('12345', 'X'))),
    ).rejects.toMatchObject(new DomainError('INVALID_ISBN'))
  })

  it('clips over-long source values to the field limits', async () => {
    const isbn = randomIsbn()
    // A surrogate pair across the limit: the clip leaves no lone half.
    const title = `${'a'.repeat(499)}😀${'a'.repeat(100)}`
    const author = unique('A').padEnd(250, 'a')
    const series = unique('S').padEnd(250, 's')
    const picked = chosen(
      candidate(isbn, title, {
        subtitle: 's'.repeat(600),
        description: 'd'.repeat(12_000),
        authors: [{ name: author }],
        series,
      }),
    )

    const { data } = await ensureSharedBook(asA, isbn, picked)
    const book = await payload.findByID({
      collection: 'books',
      id: data.id,
      overrideAccess: true,
      depth: 1,
    })
    expect(book.title).toBe('a'.repeat(499))
    expect(book.subtitle).toHaveLength(500)
    expect(book.description).toHaveLength(10_000)
    expect(book.authors).toMatchObject([{ name: author.slice(0, 200) }])
    expect(book.series).toMatchObject({ name: series.slice(0, 200) })
  })

  it("joins the caller's transaction and rolls back with it", async () => {
    const isbn = randomIsbn()
    const authorName = unique('Kalle Päätalo')
    const seriesName = unique('Iijoki')
    const picked = chosen(
      candidate(isbn, 'Huonetoverit', { authors: [{ name: authorName }], series: seriesName }),
    )
    const e = new Error('boom')
    await expect(
      withTransaction(asA, (tx) =>
        ensureSharedBook(tx, isbn, picked).then(() => {
          throw e
        }),
      ),
    ).rejects.toBe(e)
    expect((await booksWithIsbn(isbn)).totalDocs).toBe(0)
    expect(await countByName('authors', authorName)).toBe(0)
    expect(await countByName('series', seriesName)).toBe(0)
  })

  it('leaves one shared Book after two concurrent creates', async () => {
    const isbn = randomIsbn()
    // No authors and no series: the Book insert is the only contested write.
    const picked = chosen(candidate(isbn, 'Puhdistus', { authors: [] }))
    const settled = await Promise.allSettled([
      ensureSharedBook(asA, isbn, picked),
      ensureSharedBook(asB, isbn, picked),
    ])

    const fulfilled = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value.data] : []))
    expect(fulfilled.some((r) => r.created)).toBe(true)
    expect(new Set(fulfilled.map((r) => r.id)).size).toBe(1)
    for (const r of settled) {
      if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(ValidationError)
    }

    const { docs } = await booksWithIsbn(isbn)
    expect(docs.filter((book) => book.visibility === 'shared')).toHaveLength(1)
    expect(docs[0]!.id).toBe(fulfilled[0]!.id)
  })
})
