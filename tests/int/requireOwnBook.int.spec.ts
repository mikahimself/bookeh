import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { requireOwnBook } from '@/lib/books/requireOwnBook'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `requireOwnBook()`, AD-7: a Book reached by id opens only for a viewer who
// has a copy of it. A holds a shared and a private Book; B holds neither.

describe('requireOwnBook', () => {
  let payload: Payload
  let asA: Context
  let asB: Context
  let shared: Book
  let own: Book

  /** A system write, as `lib/catalogue` makes it, with `user` on the request. */
  const systemBook = async (user: User, visibility: Book['visibility']) =>
    payload.create({
      collection: 'books',
      data: { title: 'Kalevala', isbn13: randomIsbn(), visibility },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
    const a = await createUser({ displayName: 'Own Book User A' })
    const b = await createUser({ displayName: 'Own Book User B' })
    asA = await contextFor(a)
    asB = await contextFor(b)

    shared = await systemBook(a, 'shared')
    own = await systemBook(a, 'private')
    for (const book of [shared, own]) {
      // `owner` only satisfies the create type.
      await gateway.create(asA, {
        collection: 'copies',
        data: { owner: a.id, book: book.id, status: 'owned' },
        depth: 0,
      })
    }
  })

  it('passes for the viewer who holds a shared or a private Book', async () => {
    await expect(requireOwnBook(asA, shared.id)).resolves.toBeUndefined()
    await expect(requireOwnBook(asA, own.id)).resolves.toBeUndefined()
  })

  it("fails with NOT_FOUND for another user's shared or private Book", async () => {
    await expect(requireOwnBook(asB, shared.id)).rejects.toMatchObject(new DomainError('NOT_FOUND'))
    await expect(requireOwnBook(asB, own.id)).rejects.toMatchObject(new DomainError('NOT_FOUND'))
  })

  it('fails with NOT_FOUND for an id that is not a row id, before any read', async () => {
    const count = vi.spyOn(payload, 'count')
    try {
      for (const id of [0, -1, 1.5, Number.NaN, 2147483648]) {
        await expect(requireOwnBook(asA, id)).rejects.toMatchObject(new DomainError('NOT_FOUND'))
      }
      expect(count).not.toHaveBeenCalled()
    } finally {
      count.mockRestore()
    }
  })
})
