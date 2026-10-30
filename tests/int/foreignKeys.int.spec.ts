import { randomUUID } from 'node:crypto'

import { getPayload, type CollectionSlug, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { setRead } from '@/lib/books/setRead'
import { saveCopy } from '@/lib/catalogue/saveCopy'
import { createCopy } from '@/lib/copies/createCopy'
import { lendCopy, returnLoan } from '@/lib/loans/loans'
import * as gateway from '@/lib/payload/gateway'
import { createEntry, setEntryRecipient } from '@/lib/wishlists/entries'
import { createWishlist } from '@/lib/wishlists/wishlists'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { as, contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// Spine, AD-19, on the migration-built database: a user delete cascades to
// everything they own or created, references refuse, and a back-office delete
// of a referenced row is refused with a readable message.

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

describe('foreign keys', () => {
  let payload: Payload
  let admin: User

  const sharedBook = () =>
    payload.create({
      collection: 'books',
      data: { title: unique('Seitsemän veljestä'), isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })

  const count = async (collection: CollectionSlug, field: string, value: number) =>
    (
      await payload.count({
        collection,
        where: { [field]: { equals: value } },
        overrideAccess: true,
      })
    ).totalDocs

  const userWith = async () => {
    const user = await createUser({ displayName: 'FK User' })
    return { user, ctx: await contextFor(user) }
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    admin = await createUser({ roles: ['admin', 'user'] })
  })

  it("deletes a user's rows with the user and keeps another user's copy of a shared Book", async () => {
    const { user, ctx } = await userWith()
    const other = await userWith()
    const shared = await sharedBook()

    const sharedCopy = (await createCopy(ctx, { bookId: shared.id, status: 'owned' })).data
    await setRead(ctx, { bookId: shared.id }, true)
    const { data: loan } = await lendCopy(ctx, sharedCopy, { create: 'Liisa' })
    await returnLoan(ctx, loan.loanId)
    await lendCopy(ctx, sharedCopy, loan.person.id)
    const saved = await saveCopy(ctx, {
      requestId: randomUUID(),
      target: { manual: { title: unique('Oma kirja'), authors: [unique('Oma Tekijä')] } },
      save: { kind: 'copy' },
    })
    const list = await createWishlist(ctx, unique('Toiveet'))
    const entry = (await createEntry(ctx, { wishlist: list, bookId: shared.id })).data.entryId
    await setEntryRecipient(ctx, entry, { create: 'Matti' })
    const location = await gateway.create(ctx, {
      collection: 'locations',
      data: { owner: user.id, name: 'Olohuone', nameKey: '' },
      depth: 0,
    })
    const theirs = (await createCopy(other.ctx, { bookId: shared.id, status: 'owned' })).data
    const privateBook = await payload.findByID({
      collection: 'books',
      id: saved.bookId,
      depth: 0,
    })
    const privateAuthor = privateBook.authors![0] as number

    await payload.delete({ collection: 'users', id: user.id, ...(await as(admin)) })

    for (const collection of [
      'copies',
      'locations',
      'loans',
      'people',
      'user-books',
      'wishlists',
      'wishlist-entries',
    ] as const) {
      expect([collection, await count(collection, 'owner', user.id)]).toEqual([collection, 0])
    }
    for (const collection of ['books', 'authors'] as const) {
      expect([collection, await count(collection, 'createdBy', user.id)]).toEqual([collection, 0])
    }
    expect(await count('authors', 'id', privateAuthor)).toBe(0)
    expect(await count('locations', 'id', location.id)).toBe(0)
    expect(await count('books', 'id', shared.id)).toBe(1)
    expect(await count('copies', 'id', theirs)).toBe(1)
  })

  it('refuses back-office deletes of referenced rows with a readable message', async () => {
    const { ctx } = await userWith()
    const book = await sharedBook()
    const copy = (await createCopy(ctx, { bookId: book.id, status: 'owned' })).data
    const { data: loan } = await lendCopy(ctx, copy, { create: unique('Liisa') })
    const author = await payload.create({
      collection: 'authors',
      data: { name: unique('Aleksis Kivi'), nameKey: '', visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })
    await payload.update({
      collection: 'books',
      id: book.id,
      data: { authors: [author.id] },
      overrideAccess: true,
    })
    // The admin counts only rows they may read (FR-48): their own copy of the Book.
    await createCopy(await contextFor(admin), { bookId: book.id, status: 'owned' })
    const asOwner = await as(ctx.user as User)
    const asAdmin = await as(admin)

    const refusals = [
      () => payload.delete({ collection: 'copies', id: copy, ...asOwner }),
      () => payload.delete({ collection: 'people', id: loan.person.id, ...asOwner }),
      () => payload.delete({ collection: 'books', id: book.id, ...asAdmin }),
      () => payload.delete({ collection: 'authors', id: author.id, ...asAdmin }),
    ]
    for (const refusal of refusals) {
      await expect(refusal()).rejects.toMatchObject({ status: 409, isPublic: true })
    }
    // Every row stays, and the author stays on the Book.
    expect(await count('copies', 'id', copy)).toBe(1)
    expect(await count('people', 'id', loan.person.id)).toBe(1)
    expect(
      (await payload.findByID({ collection: 'books', id: book.id, depth: 0 })).authors,
    ).toEqual([author.id])
  })

  // Story 7.4's race: an entry the delete could not see refuses it instead of losing its recipient.
  it('refuses a delete the hook does not count by the foreign key, losing nothing', async () => {
    const { user, ctx } = await userWith()
    const book = await sharedBook()
    const list = await createWishlist(ctx, unique('Lahjat'))
    const entry = (await createEntry(ctx, { wishlist: list, bookId: book.id })).data.entryId
    const person = await setEntryRecipient(ctx, entry, { create: unique('Matti') })

    // No user on the request: the hook skips, as for a reference it cannot read.
    await expect(
      payload.delete({ collection: 'people', id: person!, overrideAccess: true }),
    ).rejects.toThrow()

    expect(await count('people', 'id', person!)).toBe(1)
    const stored = await payload.findByID({ collection: 'wishlist-entries', id: entry, depth: 0 })
    expect(stored.forPerson).toBe(person)
    expect(stored.owner).toBe(user.id)
  })
})
