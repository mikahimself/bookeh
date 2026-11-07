import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'

import { upsertUserBook } from '@/lib/books/upsertUserBook'
import { removeCopies } from '@/lib/copies/removeCopies'
import * as gateway from '@/lib/payload/gateway'
import { readingNow } from '@/lib/shelf/readingNow'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { copyAs, sharedBook, unique } from '../helpers/builders'
import { contextFor, createUser } from '../helpers/harness'

// `readingNow()` (FR-56, AD-7, AD-8): the viewer's Books in reading that are
// still held (a visible copy, owned or ordered, or an open wishlist entry), by
// `readingSince` then Book id, never a Book the viewer may not read (AD-4).
// The two-user case is in shelfIds.int.spec.ts.

describe('readingNow', () => {
  const entryOn = async (user: User, book: Book, closed?: boolean) => {
    const ctx = await contextFor(user)
    const list = await gateway.create(ctx, {
      collection: 'wishlists',
      data: { owner: user.id, name: unique('Toiveet'), nameKey: 'ignored' },
      depth: 0,
    })
    return gateway.create(ctx, {
      collection: 'wishlist-entries',
      data: {
        owner: user.id,
        wishlist: list.id,
        book: book.id,
        ...(closed && { closedAt: new Date().toISOString() }),
      },
      depth: 0,
    })
  }

  it('lists held Books being read, oldest start first, ties by Book id', async () => {
    const a = await createUser({ displayName: 'Reading Now' })
    const other = await createUser({ displayName: 'Reading Now Other' })
    const asA = await contextFor(a)
    const x = await sharedBook({ by: a })
    const y = await sharedBook({ by: a })
    const z = await sharedBook({ by: a })
    const ordered = await sharedBook({ by: a })
    const wished = await sharedBook({ by: a })
    const removed = await sharedBook({ by: a })
    const closed = await sharedBook({ by: a })
    const finished = await sharedBook({ by: a })
    const hidden = await sharedBook({ by: other })

    await copyAs(a, { book: x.id })
    await copyAs(a, { book: y.id })
    await copyAs(a, { book: z.id })
    await copyAs(a, { book: ordered.id, status: 'ordered' })
    await entryOn(a, wished)
    const gone = await copyAs(a, { book: removed.id })
    await removeCopies(asA, [gone.id])
    await entryOn(a, closed, true)
    await copyAs(a, { book: finished.id })
    await copyAs(a, { book: hidden.id })

    const day = (date: string) => `${date}T12:00:00.000Z`
    await upsertUserBook(asA, x.id, { readingSince: day('2026-10-21') })
    await upsertUserBook(asA, y.id, { readingSince: day('2026-11-03') })
    await upsertUserBook(asA, z.id, { readingSince: day('2026-10-21') })
    await upsertUserBook(asA, ordered.id, { readingSince: day('2026-11-04') })
    await upsertUserBook(asA, wished.id, { readingSince: day('2026-11-05') })
    await upsertUserBook(asA, removed.id, { readingSince: day('2026-10-01') })
    await upsertUserBook(asA, closed.id, { readingSince: day('2026-10-01') })
    await upsertUserBook(asA, finished.id, {
      read: true,
      readingSince: day('2026-10-01'),
      finishedAt: day('2026-10-02'),
    })
    // Held and being read, then made private by its creator: unreadable to A (AD-4).
    await upsertUserBook(asA, hidden.id, { readingSince: day('2026-10-01') })
    await (
      await getPayload({ config })
    ).update({
      collection: 'books',
      id: hidden.id,
      data: { visibility: 'private' },
      overrideAccess: true,
      req: (await contextFor(other)).req,
    })

    const reading = await readingNow(asA)
    expect(reading.map((r) => [r.book.bookId, r.since])).toEqual([
      [x.id, '2026-10-21'],
      [z.id, '2026-10-21'],
      [y.id, '2026-11-03'],
      [ordered.id, '2026-11-04'],
      [wished.id, '2026-11-05'],
    ])
  })
})
