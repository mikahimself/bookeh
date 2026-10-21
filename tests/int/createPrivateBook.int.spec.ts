import { randomUUID } from 'node:crypto'

import { getPayload, NotFound, type Payload } from 'payload'
import {
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
import { type ManualEntry, normaliseManual } from '@/lib/catalogue/createPrivateBook'
import { lookupBook } from '@/lib/catalogue/lookupBook'
import { saveCopy, type SaveInput } from '@/lib/catalogue/saveCopy'
import { DomainError } from '@/lib/errors'
import { lookupSources } from '@/lib/metadata/lookup'
import { undo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { Author, Book, User, UserLocation } from '@/payload-types'

import { as, contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'
import { rejectedPaths } from '../helpers/validation'

// Story 3.38, FR-12/AD-4/AD-5: a manual save makes a private Book from the
// typed title and authors, matched in the private scope, or uses a Book the
// user already holds for the typed ISBN. The sources are faked at
// `lookupSources` and must never be asked by a save; `fetch` likewise.

vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn(), heldOutcome: vi.fn() }))

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

/** The ISBN-10 of a 978 ISBN-13, hyphenated as printed in a book. */
function hyphenatedIsbn10(isbn13: string): string {
  const core = isbn13.slice(3, 12)
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i)
  const check = (11 - (sum % 11)) % 11
  return `${core.slice(0, 1)}-${core.slice(1, 4)}-${core.slice(4)}-${check === 10 ? 'X' : check}`
}

const manualInput = (manual: ManualEntry): SaveInput => ({
  requestId: randomUUID(),
  target: { manual },
  save: { kind: 'copy' },
})

describe('saveCopy with a manual target', () => {
  let payload: Payload
  let fetchSpy: MockInstance<typeof fetch>

  const bookById = (id: number) =>
    payload.findByID({ collection: 'books', id, overrideAccess: true, depth: 0 })

  const authorById = (id: number) =>
    payload.findByID({ collection: 'authors', id, overrideAccess: true, depth: 0 })

  const authorIdsOf = (book: Book) =>
    (book.authors ?? []).map((author) => (typeof author === 'number' ? author : author.id))

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

  const countAuthors = async (name: string) =>
    (
      await payload.count({
        collection: 'authors',
        where: { nameKey: { equals: toNameKey(name) } },
        overrideAccess: true,
      })
    ).totalDocs

  /** A system write, as `lib/catalogue` makes it, with `user` on the request. */
  const systemAuthor = async (user: User, name: string, visibility: Author['visibility']) =>
    payload.create({
      collection: 'authors',
      data: { name, nameKey: '', visibility },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const systemBook = async (user: User, isbn13: string, visibility: Book['visibility']) =>
    payload.create({
      collection: 'books',
      data: { title: 'Tuntematon sotilas', isbn13, visibility },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const freshUser = async (data: Partial<User> = {}) => {
    const user = await createUser({ displayName: 'Manual Entry User', ...data })
    return { user, ctx: await contextFor(user) }
  }

  /** A fresh user whose profile default is a new location, and its context. */
  const userWithDefault = async () => {
    const user = await createUser({ displayName: 'Manual Entry Default User' })
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

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(() => {
    vi.mocked(lookupSources).mockReset()
    vi.mocked(lookupSources).mockResolvedValue({ kind: 'none' })
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a private Book with a normalised ISBN, title and a new private author', async () => {
    const { user, location, ctx } = await userWithDefault()
    const isbn = randomIsbn()
    const author = unique('Aleksis Kivi')

    const result = await saveCopy(
      ctx,
      manualInput({
        isbn: hyphenatedIsbn10(isbn),
        title: '  Seitsemän  veljestä ',
        authors: [author],
      }),
    )

    const book = await bookById(result.bookId)
    expect(book).toMatchObject({
      isbn13: isbn,
      title: 'Seitsemän veljestä',
      visibility: 'private',
      createdBy: user.id,
    })
    expect(book.source ?? null).toBeNull()
    expect(book.rawMetadata ?? null).toBeNull()
    expect(book.cover ?? null).toBeNull()
    expect(book.series ?? null).toBeNull()
    expect(book.genres ?? []).toEqual([])
    const [authorId] = authorIdsOf(book)
    expect(await authorById(authorId!)).toMatchObject({
      name: author,
      visibility: 'private',
      createdBy: user.id,
    })
    expect(authorIdsOf(book)).toHaveLength(1)

    const copies = await copiesOf(user)
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({
      id: result.copyId,
      book: book.id,
      status: 'owned',
      location: location.id,
    })
    expect(result.savedTo).toEqual({ id: location.id, name: 'Kirjahylly' })
    expect(lookupSources).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('creates a Book without an ISBN, and a second one on a second save', async () => {
    const { user, ctx } = await freshUser()
    const author = unique('Minna Canth')

    const first = await saveCopy(ctx, manualInput({ title: 'Työmiehen vaimo', authors: [author] }))
    const second = await saveCopy(
      ctx,
      manualInput({ isbn: '  ', title: 'Työmiehen vaimo', authors: [author] }),
    )

    expect(second.bookId).not.toBe(first.bookId)
    for (const id of [first.bookId, second.bookId]) {
      const book = await bookById(id)
      expect(book.isbn13 ?? null).toBeNull()
      expect(book.visibility).toBe('private')
    }
    // The author is matched again: one private row of the user's.
    expect(authorIdsOf(await bookById(second.bookId))).toEqual(
      authorIdsOf(await bookById(first.bookId)),
    )
    expect(await countAuthors(author)).toBe(1)
    expect((await copiesOf(user)).map((copy) => copy.book).sort()).toEqual(
      [first.bookId, second.bookId].sort(),
    )
  })

  it('stores a title and author typed in NFD as NFC', async () => {
    const { ctx } = await freshUser()
    const suffix = randomUUID().slice(0, 8)
    // Explicit escapes: decomposed 'ä' is 'a' plus U+0308.
    const title = `Ka\u0308a\u0308rme ${suffix}`
    const author = `Pa\u0308a\u0308talo ${suffix}`
    expect(title).not.toBe(title.normalize('NFC'))
    expect(author).not.toBe(author.normalize('NFC'))

    const { bookId } = await saveCopy(ctx, manualInput({ title, authors: [author] }))

    const book = await bookById(bookId)
    expect(book.title).toBe(title.normalize('NFC'))
    expect((await authorById(authorIdsOf(book)[0]!)).name).toBe(author.normalize('NFC'))
  })

  it("links shared and the user's own private authors, never another user's", async () => {
    const { user: a, ctx } = await freshUser()
    const b = await createUser({ displayName: 'Manual Entry User B' })
    const shared = await systemAuthor(b, unique('Tove Jansson'), 'shared')
    const ofA = await systemAuthor(a, unique('Eeva Kilpi'), 'private')
    const ofB = await systemAuthor(b, unique('Arto Paasilinna'), 'private')

    const { bookId } = await saveCopy(
      ctx,
      manualInput({
        title: 'Muumipeikko',
        authors: [shared.name.toUpperCase(), ofA.name, ofB.name],
      }),
    )

    const ids = authorIdsOf(await bookById(bookId))
    expect(ids.slice(0, 2)).toEqual([shared.id, ofA.id])
    expect(ids).toHaveLength(3)
    expect(ids[2]).not.toBe(ofB.id)
    expect(await authorById(ids[2]!)).toMatchObject({
      name: ofB.name,
      visibility: 'private',
      createdBy: a.id,
    })
    expect(await authorById(ofB.id)).toEqual(ofB)
    expect(await authorById(shared.id)).toEqual(shared)
  })

  it('drops blank and repeated authors', async () => {
    const { ctx } = await freshUser()
    const name = unique('Kivi')

    const { bookId } = await saveCopy(
      ctx,
      manualInput({ title: 'Nummisuutarit', authors: [name, ' ', name.toLowerCase()] }),
    )

    const ids = authorIdsOf(await bookById(bookId))
    expect(ids).toHaveLength(1)
    expect((await authorById(ids[0]!)).name).toBe(name)
  })

  it.each([
    ['no authors', undefined, []],
    ['a blank author', undefined, ['  ']],
    ['a blank author, before an invalid ISBN', 'abc', ['  ']],
  ])('rejects a blank title and %s in one error before any read', async (_, isbn, authors) => {
    const { user, ctx } = await freshUser()
    const find = vi.spyOn(payload, 'find')
    const create = vi.spyOn(payload, 'create')

    const err: unknown = await saveCopy(
      ctx,
      manualInput({ ...(isbn !== undefined && { isbn }), title: '  ', authors }),
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(DomainError)
    expect(err).toMatchObject({
      code: 'VALIDATION',
      fields: { title: 'VALIDATION', authors: 'VALIDATION' },
    })
    expect(find).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    vi.restoreAllMocks()
    expect(await copiesOf(user)).toEqual([])
  })

  it.each([
    [
      'a title over 500',
      { title: 'a'.repeat(501), authors: ['Juhani Aho'] },
      { title: 'TOO_LONG' },
    ],
    [
      'an author over 200',
      { title: 'Rautatie', authors: ['a'.repeat(201)] },
      { authors: 'TOO_LONG' },
    ],
    [
      'a blank title beside an author over 200',
      { title: ' ', authors: ['Juhani Aho', 'a'.repeat(201)] },
      { title: 'VALIDATION', authors: 'TOO_LONG' },
    ],
  ])('marks %s as TOO_LONG, never clipped', (_, manual, fields) => {
    expect(() => normaliseManual(manual)).toThrow(
      expect.objectContaining({ code: 'VALIDATION', fields }),
    )
  })

  it('measures the length after normalising', () => {
    const title = `  ${'a'.repeat(250)}   ${'b'.repeat(249)} `
    expect(normaliseManual({ title, authors: ['Juhani Aho'] }).title).toHaveLength(500)
  })

  it('rejects an invalid ISBN before any read', async () => {
    const { user, ctx } = await freshUser()
    const author = unique('Juhani Aho')
    const find = vi.spyOn(payload, 'find')
    const create = vi.spyOn(payload, 'create')

    await expect(
      saveCopy(ctx, manualInput({ isbn: 'abc', title: 'Rautatie', authors: [author] })),
    ).rejects.toMatchObject({ code: 'INVALID_ISBN' })
    expect(find).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    vi.restoreAllMocks()
    expect(await copiesOf(user)).toEqual([])
    expect(await countAuthors(author)).toBe(0)
  })

  it('answers the private Book on a later scan, and saves a second copy of it', async () => {
    const { user, ctx } = await freshUser()
    const isbn = randomIsbn()

    const first = await saveCopy(
      ctx,
      manualInput({ isbn, title: 'Alastalon salissa', authors: [unique('Volter Kilpi')] }),
    )
    const answer = await lookupBook(ctx, { isbn })
    const again = await saveCopy(ctx, {
      requestId: randomUUID(),
      target: { isbn13: isbn },
      save: { kind: 'copy' },
    })

    expect(answer).toMatchObject({ kind: 'existing', book: { bookId: first.bookId } })
    expect(again.bookId).toBe(first.bookId)
    expect(again.copyId).not.toBe(first.copyId)
    expect((await booksWithIsbn(isbn)).map((book) => book.id)).toEqual([first.bookId])
    expect(await copiesOf(user)).toHaveLength(2)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each(['shared', 'private'] as const)(
    'uses a %s Book the user holds for the ISBN and drops the typed values',
    async (visibility) => {
      const { user, ctx } = await freshUser()
      const isbn = randomIsbn()
      const held = await systemBook(user, isbn, visibility)
      const author = unique('Mika Waltari')

      const result = await saveCopy(
        ctx,
        manualInput({ isbn, title: 'Sinuhe egyptiläinen', authors: [author] }),
      )

      expect(result.bookId).toBe(held.id)
      expect(await booksWithIsbn(isbn)).toEqual([held])
      expect(await countAuthors(author)).toBe(0)
      expect((await copiesOf(user)).map((copy) => copy.book)).toEqual([held.id])
      expect(lookupSources).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    },
  )

  it('keeps the Book and its private author from another user', async () => {
    const { ctx } = await freshUser()
    const b = await createUser({ displayName: 'Manual Entry User B' })
    const isbn = randomIsbn()
    const { bookId } = await saveCopy(
      ctx,
      manualInput({ isbn, title: 'Rautatie', authors: [unique('Juhani Aho')] }),
    )
    const [authorId] = authorIdsOf(await bookById(bookId))
    const asB = await as(b)

    const books = await payload.find({
      collection: 'books',
      where: { id: { equals: bookId } },
      ...asB,
    })
    const authors = await payload.find({
      collection: 'authors',
      where: { id: { equals: authorId } },
      ...asB,
    })
    expect(books.docs).toEqual([])
    expect(authors.docs).toEqual([])
    await expect(payload.findByID({ collection: 'books', id: bookId, ...asB })).rejects.toThrow(
      NotFound,
    )
    await expect(
      payload.findByID({ collection: 'authors', id: authorId!, ...asB }),
    ).rejects.toThrow(NotFound)
    expect(await lookupBook(await contextFor(b), { isbn })).toEqual({ kind: 'none' })
  })

  it('rolls back the Book and its new author when the copy fails', async () => {
    const created = await createUser({ displayName: 'Manual Entry Broken Default' })
    // A default that names no location: the copy insert is the failing write.
    const ctx = await contextFor({ ...created, defaultLocation: 2_000_000_000 })
    const isbn = randomIsbn()
    const author = unique('Kalle Päätalo')

    expect(
      await rejectedPaths(saveCopy(ctx, manualInput({ isbn, title: 'Iijoki', authors: [author] }))),
    ).toEqual(['location'])

    expect(await booksWithIsbn(isbn)).toEqual([])
    expect(await countAuthors(author)).toBe(0)
    expect(await copiesOf(created)).toEqual([])
  })

  it('undo deletes the copy, the private Book and its new author, not a matched one', async () => {
    const { user, ctx } = await freshUser()
    const b = await createUser({ displayName: 'Manual Entry User B' })
    const shared = await systemAuthor(b, unique('Tove Jansson'), 'shared')
    const isbn = randomIsbn()
    const author = unique('Lars Jansson')

    const result = await saveCopy(
      ctx,
      manualInput({ isbn, title: 'Muumilaakson marraskuu', authors: [author, shared.name] }),
    )
    await undo(ctx, result.undoToken)

    expect(await booksWithIsbn(isbn)).toEqual([])
    expect(await countAuthors(author)).toBe(0)
    expect(await authorById(shared.id)).toEqual(shared)
    expect(await copiesOf(user)).toEqual([])
  })
})
