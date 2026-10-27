import { randomUUID } from 'node:crypto'

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
// has a copy or an open wishlist entry of it (H14). A holds a shared and a
// private Book, wishes for a third and once wished for a fourth; B holds none.

describe('requireOwnBook', () => {
  let payload: Payload
  let asA: Context
  let asB: Context
  let asAdmin: Context
  let shared: Book
  let own: Book
  let wished: Book
  let wishedOnce: Book

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
    asAdmin = await contextFor(
      await createUser({ displayName: 'Own Book Admin', roles: ['admin'] }),
    )

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

    wished = await systemBook(a, 'shared')
    wishedOnce = await systemBook(a, 'shared')
    // `owner` and `nameKey` only satisfy the create type.
    const list = await gateway.create(asA, {
      collection: 'wishlists',
      data: { owner: a.id, name: `Toiveet ${randomUUID()}`, nameKey: 'ignored' },
      depth: 0,
    })
    await gateway.create(asA, {
      collection: 'wishlist-entries',
      data: { owner: a.id, wishlist: list.id, book: wished.id },
      depth: 0,
    })
    await gateway.create(asA, {
      collection: 'wishlist-entries',
      data: {
        owner: a.id,
        wishlist: list.id,
        book: wishedOnce.id,
        closedAt: '2026-10-27T18:45:12.345Z',
      },
      depth: 0,
    })
  })

  it('passes for the viewer who holds a shared or a private Book', async () => {
    await expect(requireOwnBook(asA, shared.id)).resolves.toBeUndefined()
    await expect(requireOwnBook(asA, own.id)).resolves.toBeUndefined()
  })

  it('passes for a Book held only through an open entry', async () => {
    await expect(requireOwnBook(asA, wished.id)).resolves.toBeUndefined()
  })

  it('fails with NOT_FOUND for a Book with only a closed entry', async () => {
    await expect(requireOwnBook(asA, wishedOnce.id)).rejects.toMatchObject(
      new DomainError('NOT_FOUND'),
    )
  })

  it("fails with NOT_FOUND for another user's wish-only Book", async () => {
    for (const ctx of [asB, asAdmin]) {
      await expect(requireOwnBook(ctx, wished.id)).rejects.toMatchObject(
        new DomainError('NOT_FOUND'),
      )
    }
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
