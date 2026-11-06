import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { helsinkiToday, noonUtc, finishedDays } from '@/fields/readingDates'
import { setReadingDates } from '@/lib/books/setReadingDates'
import { getUserBookState } from '@/lib/books/userBookState'
import { runAction } from '@/lib/errors'
import { setRead } from '@/lib/books/setRead'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import { undo, withUndo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { Book, Copy, User } from '@/payload-types'

import { failure } from '../helpers/builders'
import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `setRead()`, AD-18/AD-20: read belongs to the user and the Book, so a
// selection of copies acts on its distinct Books, undoable through
// `withUndo()`. Each case uses fresh Books so flags never carry over.

describe('setRead', () => {
  let payload: Payload
  let creator: User

  const newBook = async (): Promise<Book> =>
    payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(creator)).req,
    })

  const copyFor = async (user: User, book: Book): Promise<Copy> =>
    payload.create({
      collection: 'copies',
      data: {
        owner: user.id,
        acquiredAt: '2026-01-01T12:00:00.000Z',
        book: book.id,
        status: 'owned',
      },
      overrideAccess: false,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const rowsOf = async (user: User, book: Book) =>
    (
      await payload.find({
        collection: 'user-books',
        where: { and: [{ owner: { equals: user.id } }, { book: { equals: book.id } }] },
        depth: 0,
      })
    ).docs

  const isRead = async (user: User, book: Book) =>
    (await rowsOf(user, book)).some((row) => row.read === true)

  beforeAll(async () => {
    payload = await getPayload({ config })
    creator = await createUser({ displayName: 'Set Read Books' })
  })

  it('marks the distinct unread Books read on toggle and Undo puts them back', async () => {
    const a = await createUser({ displayName: 'Set Read Mixed' })
    const asA = await contextFor(a)
    const [x, y] = [await newBook(), await newBook()]
    const c1 = await copyFor(a, x)
    const c2 = await copyFor(a, x)
    const c3 = await copyFor(a, y)
    await upsertUserBook(asA, y.id, { read: true })

    const result = await withUndo(asA, (tx) =>
      setRead(tx, { copyIds: [c1.id, c2.id, c3.id, c1.id] }, 'toggle'),
    )
    expect(result).toMatchObject({ state: 'read', count: 2 })
    expect(await isRead(a, x)).toBe(true)
    expect(await isRead(a, y)).toBe(true)

    // y was already read, so it is not in the restore: Undo leaves a later change alone.
    await upsertUserBook(asA, y.id, { read: false })
    await undo(asA, result.undoToken)
    expect(await isRead(a, x)).toBe(false)
    expect(await isRead(a, y)).toBe(false)
  })

  it('puts a read flag back after marking it unread, keeping the row', async () => {
    const a = await createUser({ displayName: 'Set Read Unread' })
    const asA = await contextFor(a)
    const x = await newBook()
    await copyFor(a, x)
    await upsertUserBook(asA, x.id, { read: true })

    const result = await withUndo(asA, (tx) => setRead(tx, { bookId: x.id }, 'toggle'))
    expect(result).toMatchObject({ state: 'unread', count: 1 })
    expect(await isRead(a, x)).toBe(false)

    await undo(asA, result.undoToken)
    expect(await isRead(a, x)).toBe(true)
    expect(await rowsOf(a, x)).toHaveLength(1)
  })

  it('toggles to unread when every target Book is read, by Book id or copies', async () => {
    const a = await createUser({ displayName: 'Set Read All' })
    const asA = await contextFor(a)
    const [x, y] = [await newBook(), await newBook()]
    const cx = await copyFor(a, x)
    const cy = await copyFor(a, y)
    await upsertUserBook(asA, x.id, { read: true })
    await upsertUserBook(asA, y.id, { read: true })

    expect((await setRead(asA, { bookId: x.id }, 'toggle')).data).toEqual({
      state: 'unread',
      count: 1,
      finishedDays: null,
    })
    expect(await isRead(a, x)).toBe(false)

    await upsertUserBook(asA, x.id, { read: true })
    expect((await setRead(asA, { copyIds: [cx.id, cy.id] }, 'toggle')).data).toEqual({
      state: 'unread',
      count: 2,
      finishedDays: null,
    })
    expect(await isRead(a, x)).toBe(false)
    expect(await isRead(a, y)).toBe(false)
  })

  it("refuses another user's copy and an unheld Book with NOT_FOUND, writing nothing", async () => {
    const a = await createUser({ displayName: 'Set Read Owner' })
    const b = await createUser({ displayName: 'Set Read Other' })
    const asA = await contextFor(a)
    const [x, y] = [await newBook(), await newBook()]
    const mine = await copyFor(a, x)
    const theirs = await copyFor(b, y)

    const notFound = { code: 'NOT_FOUND' }
    expect(await failure(setRead(asA, { copyIds: [mine.id, theirs.id] }, 'read'))).toMatchObject(
      notFound,
    )
    expect(await failure(setRead(asA, { bookId: y.id }, 'read'))).toMatchObject(notFound)
    expect(await failure(setRead(asA, { copyIds: [] }, 'read'))).toMatchObject(notFound)
    expect(await rowsOf(a, x)).toHaveLength(0)
    expect(await rowsOf(a, y)).toHaveLength(0)
  })

  it('skips a Book whose row is gone on Undo', async () => {
    const a = await createUser({ displayName: 'Set Read Gone' })
    const asA = await contextFor(a)
    const x = await newBook()
    await copyFor(a, x)

    const { undoToken } = await withUndo(asA, (tx) => setRead(tx, { bookId: x.id }, 'read'))
    for (const row of await rowsOf(a, x)) {
      await payload.delete({ collection: 'user-books', id: row.id })
    }

    await expect(undo(asA, undoToken)).resolves.toBeUndefined()
    expect(await rowsOf(a, x)).toHaveLength(0)
  })

  it('applies every transition, preserves no-ops and counts calendar finish days', async () => {
    const a = await createUser({ displayName: 'Reading transitions' })
    const ctx = await contextFor(a)
    const today = helsinkiToday()
    const started = '2026-03-28'
    const finished = '2026-03-30'
    for (const from of ['unread', 'reading', 'read'] as const) {
      for (const to of ['unread', 'reading', 'read'] as const) {
        const book = await newBook()
        await copyFor(a, book)
        const previous = {
          read: from === 'read',
          readingSince: from === 'unread' ? null : started,
          finishedAt: from === 'read' ? finished : null,
        }
        await upsertUserBook(ctx, book.id, previous)
        const [before] = await rowsOf(a, book)
        const result = await setRead(ctx, { bookId: book.id }, to)
        const expected =
          from === to
            ? previous
            : to === 'unread'
              ? { read: false, readingSince: null, finishedAt: null }
              : to === 'reading'
                ? { read: false, readingSince: previous.readingSince ?? today, finishedAt: null }
                : {
                    read: true,
                    readingSince: previous.readingSince,
                    finishedAt: from === 'reading' ? today : null,
                  }
        expect(await getUserBookState(ctx, book.id)).toMatchObject({ ...expected, state: to })
        expect(result.data).toEqual({
          state: to,
          count: 1,
          finishedDays: from === 'reading' && to === 'read' ? finishedDays(started, today) : null,
        })
        if (from === to) expect((await rowsOf(a, book))[0].updatedAt).toBe(before.updatedAt)
      }
    }
    const book = await newBook()
    await copyFor(a, book)
    await setRead(ctx, { bookId: book.id }, 'unread')
    expect(await rowsOf(a, book)).toHaveLength(0)
    expect(await getUserBookState(ctx, book.id)).toEqual({
      read: false,
      state: 'unread',
      readingSince: null,
      finishedAt: null,
      rating: null,
      tags: [],
    })
    await setRead(ctx, { bookId: book.id }, 'reading')
    expect((await setRead(ctx, { bookId: book.id }, 'toggle')).data).toEqual({
      state: 'read',
      count: 1,
      finishedDays: 1,
    })
    await setRead(ctx, { bookId: book.id }, 'unread')
    await setRead(ctx, { bookId: book.id }, 'read')
    await setRead(ctx, { bookId: book.id }, 'reading')
    expect(await getUserBookState(ctx, book.id)).toMatchObject({
      readingSince: today,
      finishedAt: null,
    })
    expect(finishedDays('2026-03-28', '2026-03-30')).toBe(2)
    expect(helsinkiToday(new Date('2026-03-28T22:30:00.000Z'))).toBe('2026-03-29')
  })

  it('edits dates on wishlist-only Books and rejects invalid service and back-office writes atomically', async () => {
    const a = await createUser({ displayName: 'Reading dates' })
    const ctx = await contextFor(a)
    const book = await newBook()
    const wishlist = await payload.create({
      collection: 'wishlists',
      data: { owner: a.id, name: 'Reading dates', nameKey: '' },
      req: ctx.req,
      overrideAccess: false,
    })
    await payload.create({
      collection: 'wishlist-entries',
      data: { owner: a.id, wishlist: wishlist.id, book: book.id },
      req: ctx.req,
      overrideAccess: false,
    })
    await upsertUserBook(ctx, book.id, { rating: 4, overrides: { title: 'My title' } })
    await setRead(ctx, { bookId: book.id }, 'reading')
    const valid = { readingSince: '2026-03-28', finishedAt: '2026-03-30' }
    expect(await setReadingDates(ctx, book.id, valid)).toMatchObject({
      ...valid,
      state: 'read',
      read: true,
      rating: 4,
    })
    const [row] = await rowsOf(a, book)
    expect(row).toMatchObject({
      readingSince: noonUtc(valid.readingSince),
      finishedAt: noonUtc(valid.finishedAt),
      overridden: ['title'],
      title: 'My title',
      rating: 4,
    })
    const invalid = async (promise: Promise<unknown>, field: string) => {
      expect(await runAction(() => promise)).toMatchObject({
        ok: false,
        code: 'VALIDATION',
        fields: { [field]: 'VALIDATION' },
      })
      expect((await rowsOf(a, book))[0]).toEqual(row)
    }
    for (const bad of [
      '2026-02-30',
      '0000-01-01',
      '2026-3-28',
      'bad',
      noonUtc(valid.readingSince),
      '2999-01-01',
    ]) {
      await invalid(setReadingDates(ctx, book.id, { ...valid, readingSince: bad }), 'readingSince')
    }
    await invalid(
      setReadingDates(ctx, book.id, { ...valid, finishedAt: '2999-01-01' }),
      'finishedAt',
    )
    await invalid(
      setReadingDates(ctx, book.id, { ...valid, finishedAt: '0000-01-01' }),
      'finishedAt',
    )
    const update = (data: Partial<typeof row>) =>
      payload.update({
        collection: 'user-books',
        id: row.id,
        data,
        req: ctx.req,
        overrideAccess: false,
        depth: 0,
      })
    await invalid(update({ read: false }), 'finishedAt')
    await invalid(update({ readingSince: '2026-03-31' }), 'finishedAt')
    await invalid(update({ finishedAt: '2026-03-27' }), 'finishedAt')
    await invalid(update({ readingSince: '0000-01-01' }), 'readingSince')
    await invalid(update({ finishedAt: '0000-01-01T12:00:00.000Z' }), 'finishedAt')
    await invalid(update({ finishedAt: '2999-01-01' }), 'finishedAt')
    await invalid(update({ readingSince: '2026-02-30T12:00:00.000Z' }), 'readingSince')
    await invalid(update({ finishedAt: 'bad' }), 'finishedAt')
    for (const roles of [['user'], ['admin']] as const) {
      const viewer = await createUser({ displayName: 'Reading privacy', roles: [...roles] })
      const other = await contextFor(viewer)
      expect(await failure(setReadingDates(other, book.id, valid))).toMatchObject({
        code: 'NOT_FOUND',
      })
      expect(await getUserBookState(other, book.id)).toMatchObject({
        state: 'unread',
        readingSince: null,
        finishedAt: null,
      })
      await copyFor(viewer, book)
      const ownDates = { readingSince: '2026-01-01', finishedAt: '2026-01-02' }
      await upsertUserBook(other, book.id, { read: true, ...ownDates })
      expect(await getUserBookState(other, book.id)).toMatchObject({ state: 'read', ...ownDates })
      expect(
        (
          await payload.find({
            collection: 'user-books',
            where: { id: { equals: row.id } },
            req: other.req,
            overrideAccess: false,
            depth: 0,
          })
        ).docs,
      ).toEqual([])
      expect(await getUserBookState(ctx, book.id)).toMatchObject({ state: 'read', ...valid })
    }
    await update({ readingSince: '2026-03-28T04:00:00.000Z' })
    expect((await rowsOf(a, book))[0].readingSince).toBe(noonUtc(valid.readingSince))
    await setRead(ctx, { bookId: book.id }, 'reading')
    expect(
      await runAction(() =>
        setReadingDates(ctx, book.id, { readingSince: null, finishedAt: null }),
      ),
    ).toMatchObject({ code: 'VALIDATION', fields: { readingSince: 'VALIDATION' } })
    expect(await getUserBookState(ctx, book.id)).toMatchObject({
      state: 'reading',
      readingSince: valid.readingSince,
      finishedAt: null,
    })
    await setRead(ctx, { bookId: book.id }, 'read')
    expect(
      await setReadingDates(ctx, book.id, { readingSince: valid.readingSince, finishedAt: null }),
    ).toMatchObject({
      read: true,
      state: 'read',
      readingSince: valid.readingSince,
      finishedAt: null,
    })
    expect((await rowsOf(a, book))[0]).toMatchObject({
      read: true,
      readingSince: noonUtc(valid.readingSince),
      finishedAt: null,
    })
    expect(
      await setReadingDates(ctx, book.id, { readingSince: null, finishedAt: valid.finishedAt }),
    ).toMatchObject({ read: true, state: 'read', readingSince: null, finishedAt: valid.finishedAt })
    expect((await rowsOf(a, book))[0]).toMatchObject({
      read: true,
      readingSince: null,
      finishedAt: noonUtc(valid.finishedAt),
    })
    expect(
      await setReadingDates(ctx, book.id, { readingSince: null, finishedAt: null }),
    ).toMatchObject({ state: 'read', readingSince: null, finishedAt: null, rating: 4 })
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      for (const [now, today, tomorrow] of [
        ['2026-03-28T21:59:59.000Z', '2026-03-28', '2026-03-29'],
        ['2026-03-28T22:00:00.000Z', '2026-03-29', '2026-03-30'],
      ]) {
        vi.setSystemTime(new Date(now))
        expect(
          await setReadingDates(ctx, book.id, { readingSince: today, finishedAt: today }),
        ).toMatchObject({ state: 'read', readingSince: today, finishedAt: today })
        const [before] = await rowsOf(a, book)
        expect(before).toMatchObject({ readingSince: noonUtc(today), finishedAt: noonUtc(today) })
        expect(
          await runAction(() =>
            setReadingDates(ctx, book.id, { readingSince: today, finishedAt: tomorrow }),
          ),
        ).toMatchObject({ code: 'VALIDATION', fields: { finishedAt: 'VALIDATION' } })
        expect((await rowsOf(a, book))[0]).toEqual(before)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('finishes mixed distinct Books in bulk and Undo restores all reading values for changed Books only', async () => {
    const a = await createUser({ displayName: 'Reading bulk Undo' })
    const ctx = await contextFor(a)
    const books = [await newBook(), await newBook(), await newBook()]
    const copies: Copy[] = []
    for (const book of books) copies.push(await copyFor(a, book))
    const duplicate = await copyFor(a, books[0])
    await upsertUserBook(ctx, books[0].id, { read: false, readingSince: '2026-03-28', rating: 5 })
    await upsertUserBook(ctx, books[2].id, {
      read: true,
      readingSince: '2026-01-01',
      finishedAt: '2026-02-01',
    })
    const previous = []
    for (const book of books) previous.push(await getUserBookState(ctx, book.id))
    const result = await withUndo(ctx, (tx) =>
      setRead(
        tx,
        { copyIds: [...copies.map((copy) => copy.id), duplicate.id, copies[0].id] },
        'toggle',
      ),
    )
    expect(result).toMatchObject({ state: 'read', count: 3, finishedDays: null })
    expect(await getUserBookState(ctx, books[0].id)).toMatchObject({
      read: true,
      readingSince: '2026-03-28',
      finishedAt: helsinkiToday(),
    })
    expect(await getUserBookState(ctx, books[1].id)).toMatchObject({
      read: true,
      readingSince: null,
      finishedAt: null,
    })
    const allRead = []
    for (const book of books) allRead.push(await getUserBookState(ctx, book.id))
    const cleared = await withUndo(ctx, (tx) =>
      setRead(tx, { copyIds: copies.map((copy) => copy.id) }, 'toggle'),
    )
    expect(cleared).toMatchObject({ state: 'unread', count: 3 })
    for (const book of books)
      expect(await getUserBookState(ctx, book.id)).toMatchObject({
        read: false,
        state: 'unread',
        readingSince: null,
        finishedAt: null,
      })
    await undo(ctx, cleared.undoToken)
    for (const [index, book] of books.entries())
      expect(await getUserBookState(ctx, book.id)).toEqual(allRead[index])
    await setReadingDates(ctx, books[2].id, { readingSince: null, finishedAt: null })
    await undo(ctx, result.undoToken)
    for (const index of [0, 1])
      expect(await getUserBookState(ctx, books[index].id)).toEqual(previous[index])
    expect(await getUserBookState(ctx, books[2].id)).toMatchObject({
      read: true,
      readingSince: null,
      finishedAt: null,
    })
  })
})
