import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { setRead } from '@/lib/books/setRead'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import { undo, withUndo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { Book, Copy, User } from '@/payload-types'

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
      data: { owner: user.id, book: book.id, status: 'owned' },
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

  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e)

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
    expect(result).toMatchObject({ read: true, count: 2 })
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
    expect(result).toMatchObject({ read: false, count: 1 })
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
      read: false,
      count: 1,
    })
    expect(await isRead(a, x)).toBe(false)

    await upsertUserBook(asA, x.id, { read: true })
    expect((await setRead(asA, { copyIds: [cx.id, cy.id] }, 'toggle')).data).toEqual({
      read: false,
      count: 2,
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
    expect(await failure(setRead(asA, { copyIds: [mine.id, theirs.id] }, true))).toMatchObject(
      notFound,
    )
    expect(await failure(setRead(asA, { bookId: y.id }, true))).toMatchObject(notFound)
    expect(await failure(setRead(asA, { copyIds: [] }, true))).toMatchObject(notFound)
    expect(await rowsOf(a, x)).toHaveLength(0)
    expect(await rowsOf(a, y)).toHaveLength(0)
  })

  it('skips a Book whose row is gone on Undo', async () => {
    const a = await createUser({ displayName: 'Set Read Gone' })
    const asA = await contextFor(a)
    const x = await newBook()
    await copyFor(a, x)

    const { undoToken } = await withUndo(asA, (tx) => setRead(tx, { bookId: x.id }, true))
    for (const row of await rowsOf(a, x)) {
      await payload.delete({ collection: 'user-books', id: row.id })
    }

    await expect(undo(asA, undoToken)).resolves.toBeUndefined()
    expect(await rowsOf(a, x)).toHaveLength(0)
  })
})
