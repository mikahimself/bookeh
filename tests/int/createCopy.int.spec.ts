import { getPayload, NotFound, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { createCopy } from '@/lib/copies/createCopy'
import type { Context } from '@/lib/payload/context'
import { withTransaction } from '@/lib/payload/transaction'
import config from '@/payload.config'
import type { Book, Copy, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'
import { rejectedPaths } from '../helpers/validation'

// `createCopy()`, AD-18: the one insert into `copies` writes an owned or
// ordered copy for the context's user, leaves a Book the user cannot read to
// the collection's `readableRelation`, and joins the caller's transaction.

describe('createCopy', () => {
  let payload: Payload
  let a: User
  let b: User
  let asA: Context
  let shared: Book

  /** A Book as `lib/catalogue` creates it, with a fresh ISBN. */
  const bookFor = async (user: User, visibility: Book['visibility']) =>
    payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const systemRead = (id: number) => payload.findByID({ collection: 'copies', id, depth: 0 })

  const copiesOf = async (user: User, book: Book) =>
    (
      await payload.count({
        collection: 'copies',
        where: { and: [{ owner: { equals: user.id } }, { book: { equals: book.id } }] },
      })
    ).totalDocs

  const expectCopy = (copy: Copy, user: User, book: Book, status: Copy['status']) => {
    expect(copy).toMatchObject({ owner: user.id, book: book.id, status })
    expect(copy.location ?? null).toBeNull()
    expect(copy.notes ?? null).toBeNull()
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Create Copy User A' })
    b = await createUser({ displayName: 'Create Copy User B' })
    asA = await contextFor(a)
    shared = await bookFor(a, 'shared')
  })

  it('creates an owned copy for the context user', async () => {
    const id = await createCopy(asA, { bookId: shared.id, status: 'owned' })
    expectCopy(await systemRead(id), a, shared, 'owned')
  })

  it('creates an ordered copy', async () => {
    const id = await createCopy(asA, { bookId: shared.id, status: 'ordered' })
    expectCopy(await systemRead(id), a, shared, 'ordered')
  })

  it("adds a second copy of the user's own private Book", async () => {
    const book = await bookFor(a, 'private')
    const first = await createCopy(asA, { bookId: book.id, status: 'owned' })
    const second = await createCopy(asA, { bookId: book.id, status: 'owned' })
    expect(second).not.toBe(first)
    expectCopy(await systemRead(first), a, book, 'owned')
    expectCopy(await systemRead(second), a, book, 'owned')
    expect(await copiesOf(a, book)).toBe(2)
  })

  it("refuses another user's private Book on `book`", async () => {
    const book = await bookFor(a, 'private')
    const asB = await contextFor(b)
    expect(await rejectedPaths(createCopy(asB, { bookId: book.id, status: 'owned' }))).toEqual([
      'book',
    ])
    expect(await copiesOf(b, book)).toBe(0)
  })

  it('leaves nothing behind when the transaction rolls back', async () => {
    const failure = new Error('after the copy')
    let seen: number | undefined
    await expect(
      withTransaction(asA, (tx) =>
        createCopy(tx, { bookId: shared.id, status: 'owned' }).then((id) => {
          seen = id
          throw failure
        }),
      ),
    ).rejects.toBe(failure)
    expect(seen).toBeTypeOf('number')
    await expect(systemRead(seen as number)).rejects.toThrow(NotFound)
  })
})
