import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { setRating } from '@/lib/books/setRating'
import { getUserBookState } from '@/lib/books/userBookState'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `setRating()`, AD-18: the rating belongs to the user and the Book and moves
// `ratedAt` with it, written through `upsertUserBook()`. No Undo.

describe('setRating', () => {
  let payload: Payload
  let creator: User

  const newBook = async (): Promise<Book> =>
    payload.create({
      collection: 'books',
      data: { title: 'Tuntematon sotilas', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(creator)).req,
    })

  const copyFor = async (user: User, book: Book) =>
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

  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e)

  beforeAll(async () => {
    payload = await getPayload({ config })
    creator = await createUser({ displayName: 'Set Rating Books' })
  })

  it('sets, changes and clears the rating with ratedAt, keeping the row, as the reader sees it', async () => {
    const a = await createUser({ displayName: 'Set Rating Owner' })
    const asA = await contextFor(a)
    const x = await newBook()
    const y = await newBook()
    await copyFor(a, x)
    await copyFor(a, y)

    await setRating(asA, x.id, 4)
    const [rated] = await rowsOf(a, x)
    expect(rated).toMatchObject({ rating: 4 })
    expect(rated.ratedAt).toEqual(expect.any(String))
    expect(await getUserBookState(asA, x.id)).toEqual({ read: false, rating: 4 })
    expect(await getUserBookState(asA, y.id)).toEqual({ read: false, rating: null })

    await setRating(asA, x.id, 2)
    const [changed] = await rowsOf(a, x)
    expect(changed).toMatchObject({ id: rated.id, rating: 2 })
    expect(Date.parse(changed.ratedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(rated.ratedAt ?? ''),
    )

    await setRating(asA, x.id, null)
    const cleared = await rowsOf(a, x)
    expect(cleared).toHaveLength(1)
    expect(cleared[0]).toMatchObject({ id: rated.id, rating: null, ratedAt: null })
  })

  it('refuses a Book the viewer holds no copy of with NOT_FOUND, writing nothing', async () => {
    const a = await createUser({ displayName: 'Set Rating Stranger' })
    const b = await createUser({ displayName: 'Set Rating Holder' })
    const x = await newBook()
    await copyFor(b, x)

    expect(await failure(setRating(await contextFor(a), x.id, 3))).toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await rowsOf(a, x)).toHaveLength(0)
  })
})
