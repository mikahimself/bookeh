import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { lookupAgain } from '@/lib/catalogue/lookupAgain'
import { LOOKUP_LIMIT, limitLookups } from '@/lib/catalogue/lookupLimit'
import { saveCopy } from '@/lib/catalogue/saveCopy'
import { DomainError } from '@/lib/errors'
import { heldOutcome, lookupSources } from '@/lib/metadata/lookup'
import type { SourceResult, SourcesOutcome } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// Story 5.35, FR-12/AD-5/D-8: Look it up again asks the sources fresh for the
// creator's private Book and runs 3.39's share without creating a copy.
// Private Books are made with the manual save; the sources are faked at
// `lookupSources` and `heldOutcome`. No candidate has a cover.

vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn(), heldOutcome: vi.fn() }))

const suffix = () => randomUUID().slice(0, 8)

const record = (isbn13: string, extra: Partial<SourceResult> = {}): SourceResult => ({
  isbn13,
  title: 'T2',
  authors: [],
  subjects: [],
  themes: [],
  source: 'finna',
  recordId: 'finna.1',
  raw: { finna: {} },
  ...extra,
})

const found = (...candidates: SourceResult[]): SourcesOutcome => ({
  kind: 'found',
  candidates,
  raw: { v: 1, fetchedAt: '2026-10-23T00:00:00.000Z', sources: {}, subjects: {}, coverUrl: null },
})

describe('lookupAgain', () => {
  let payload: Payload

  const bookById = (id: number) =>
    payload.findByID({ collection: 'books', id, overrideAccess: true, depth: 0 })

  const ofOwner = async (collection: 'copies' | 'user-books', user: User) =>
    (
      await payload.find({
        collection,
        where: { owner: { equals: user.id } },
        overrideAccess: true,
        depth: 0,
        pagination: false,
      })
    ).docs

  const freshUser = async (admin = false) => {
    const user = await createUser({
      displayName: 'Look Again User',
      ...(admin && { roles: ['admin', 'user'] }),
    })
    return { user, ctx: await contextFor(user) }
  }

  /** A private Book of the context's user from a manual save, with one copy. */
  const privateBook = async (ctx: Context, isbn: string | undefined, title = 'T1') => {
    const { bookId } = await saveCopy(ctx, {
      requestId: randomUUID(),
      target: { manual: { isbn, title, authors: [`Aleksis Kivi ${suffix()}`] } },
      save: { kind: 'copy' },
    })
    return bookById(bookId)
  }

  const sharedBook = (isbn13: string): Promise<Book> =>
    payload.create({
      collection: 'books',
      data: { isbn13, title: 'T2', source: 'google', visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })

  /** The viewer's private Book with ISBN X and another user's private Book with X. */
  const setup = async (admin = false) => {
    const a = await freshUser(admin)
    const isbn = randomIsbn()
    const own = await privateBook(a.ctx, isbn)
    const b = await freshUser()
    const ofB = await privateBook(b.ctx, isbn)
    const before = {
      ownCopies: await ofOwner('copies', a.user),
      bCopies: await ofOwner('copies', b.user),
      bRows: await ofOwner('user-books', b.user),
    }
    /** Another user's Book, row and copy are as they were; the viewer's copy count too. */
    const untouched = async () => {
      expect(await bookById(ofB.id)).toEqual(ofB)
      expect(await ofOwner('copies', b.user)).toEqual(before.bCopies)
      expect(await ofOwner('user-books', b.user)).toEqual(before.bRows)
      expect(await ofOwner('copies', a.user)).toHaveLength(before.ownCopies.length)
    }
    return { ...a, isbn, own, untouched }
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(() => {
    vi.mocked(lookupSources).mockReset()
    vi.mocked(heldOutcome).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['a user', false],
    ['the admin', true],
  ] as const)('promotes the private Book with one candidate for %s', async (_, admin) => {
    const { user, ctx, isbn, own, untouched } = await setup(admin)
    vi.mocked(lookupSources).mockResolvedValue(found(record(isbn)))

    const result = await lookupAgain(ctx, { bookId: own.id })

    expect(result).toEqual({ kind: 'shared', bookId: own.id, source: 'finna' })
    expect(lookupSources).toHaveBeenCalledWith(isbn, { fresh: true })
    expect(await bookById(own.id)).toMatchObject({ title: 'T2', visibility: 'shared' })
    const rows = await ofOwner('user-books', user)
    if (admin) expect(rows).toEqual([])
    // The candidate has no authors, so the typed author is kept too.
    else
      expect(rows).toMatchObject([{ book: own.id, overridden: ['title', 'authors'], title: 'T1' }])
    await untouched()
  })

  it('merges into the shared Book with the ISBN without asking the sources', async () => {
    const { user, ctx, isbn, own, untouched } = await setup()
    const shared = await sharedBook(isbn)

    const result = await lookupAgain(ctx, { bookId: own.id })

    expect(result).toEqual({ kind: 'shared', bookId: shared.id, source: 'google' })
    expect(lookupSources).not.toHaveBeenCalled()
    expect(await payload.count({ collection: 'books', where: { id: { equals: own.id } } })).toEqual(
      { totalDocs: 0 },
    )
    expect((await ofOwner('copies', user)).map((copy) => copy.book)).toEqual([shared.id])
    await untouched()
  })

  it('returns several candidates to pick from, writing nothing, then promotes the picked one', async () => {
    const { ctx, isbn, own, untouched } = await setup()
    const outcome = found(record(isbn), record(isbn, { title: 'T3', recordId: 'finna.2' }))
    vi.mocked(lookupSources).mockResolvedValue(outcome)

    const result = await lookupAgain(ctx, { bookId: own.id })

    expect(result).toMatchObject({
      kind: 'editions',
      pick: 0,
      candidates: [{ title: 'T2' }, { title: 'T3', recordId: 'finna.2' }],
    })
    expect(await bookById(own.id)).toEqual(own)

    vi.mocked(lookupSources).mockReset()
    vi.mocked(heldOutcome).mockReturnValue(outcome)
    const candidate = { source: 'finna', recordId: 'finna.2' }
    expect(await lookupAgain(ctx, { bookId: own.id, candidate })).toEqual({
      kind: 'shared',
      bookId: own.id,
      source: 'finna',
    })
    expect(lookupSources).not.toHaveBeenCalled()
    expect(await bookById(own.id)).toMatchObject({ title: 'T3', visibility: 'shared' })
    await untouched()
  })

  it.each([
    ['no held outcome', undefined],
    ['a held none', { kind: 'none' } as const],
  ])('asks the sources fresh for a picked candidate with %s', async (_, held) => {
    const { ctx, isbn, own } = await setup()
    vi.mocked(heldOutcome).mockReturnValue(held)
    vi.mocked(lookupSources).mockResolvedValue(
      found(record(isbn), record(isbn, { title: 'T3', recordId: 'finna.2' })),
    )

    const candidate = { source: 'finna', recordId: 'finna.2' }
    expect(await lookupAgain(ctx, { bookId: own.id, candidate })).toEqual({
      kind: 'shared',
      bookId: own.id,
      source: 'finna',
    })
    expect(lookupSources).toHaveBeenCalledWith(isbn, { fresh: true })
    expect(await bookById(own.id)).toMatchObject({ title: 'T3', visibility: 'shared' })
  })

  // AD-9: the limit is in process and per user, so the test has its own user.
  it('refuses past the lookup limit before asking the sources', async () => {
    const { ctx, own } = await setup()
    for (let i = 0; i < LOOKUP_LIMIT; i++) limitLookups(ctx)

    await expect(lookupAgain(ctx, { bookId: own.id })).rejects.toMatchObject(
      new DomainError('RATE_LIMITED'),
    )
    expect(lookupSources).not.toHaveBeenCalled()
    expect(await bookById(own.id)).toEqual(own)
  })

  it('refuses a picked candidate the outcome no longer has', async () => {
    const { ctx, isbn, own } = await setup()
    vi.mocked(heldOutcome).mockReturnValue(found(record(isbn)))

    await expect(
      lookupAgain(ctx, { bookId: own.id, candidate: { source: 'finna', recordId: 'gone' } }),
    ).rejects.toMatchObject(new DomainError('NOT_FOUND'))
    expect(await bookById(own.id)).toEqual(own)
  })

  it.each<SourcesOutcome>([{ kind: 'none' }, { kind: 'unavailable', failed: ['finna'] }])(
    'changes nothing when the sources answer $kind',
    async (outcome) => {
      const { user, ctx, own } = await setup()
      vi.mocked(lookupSources).mockResolvedValue(outcome)

      // The result has the outcome's shape for both kinds.
      expect(await lookupAgain(ctx, { bookId: own.id })).toEqual(outcome)
      expect(await bookById(own.id)).toEqual(own)
      expect(await ofOwner('user-books', user)).toEqual([])
    },
  )

  it('is NOT_FOUND before any source call for a shared Book, no ISBN or a Book not held', async () => {
    const { ctx } = await freshUser()
    const shared = await sharedBook(randomIsbn())
    await payload.create({
      collection: 'copies',
      data: { owner: ctx.user.id, book: shared.id, status: 'owned' },
      overrideAccess: true,
      depth: 0,
      req: ctx.req,
    })
    const noIsbn = await privateBook(ctx, undefined)
    const b = await freshUser()
    const ofB = await privateBook(b.ctx, randomIsbn())

    for (const bookId of [shared.id, noIsbn.id, ofB.id]) {
      await expect(lookupAgain(ctx, { bookId })).rejects.toMatchObject(new DomainError('NOT_FOUND'))
    }
    expect(lookupSources).not.toHaveBeenCalled()
  })
})
