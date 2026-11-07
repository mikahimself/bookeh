import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'

import { helsinkiToday, noonUtc } from '@/fields/readingDates'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import { removeCopies } from '@/lib/copies/removeCopies'
import { getStats } from '@/lib/stats/getStats'
import config from '@/payload.config'

import { copyAs, sharedBook } from '../helpers/builders'
import { contextFor, createUser } from '../helpers/harness'

// `getStats()` (FR-58, FR-48, AD-7): only the viewer's own held rows count, and
// an ordered copy, a Book being read or read, or one A may no longer read
// (AD-4) never collects dust. A's override sets the pages counted.

describe('getStats', () => {
  it("counts the viewer's own held rows and nothing of another user's", async () => {
    const today = helsinkiToday()
    const a = await createUser({ displayName: 'Stats A' })
    const b = await createUser({ displayName: 'Stats B' })
    const asA = await contextFor(a)
    const asB = await contextFor(b)

    const finished = await sharedBook({ by: a, pages: 123 })
    const dusty = await sharedBook({ by: a })
    const gone = await sharedBook({ by: a, pages: 400 })
    const bRead = await sharedBook({ by: b, pages: 500 })
    const bReading = await sharedBook({ by: b })
    // Older owned or ordered copies that never collect dust: ordered, being read, read.
    const orderedOld = await sharedBook({ by: a })
    const readingOld = await sharedBook({ by: a })
    const readOld = await sharedBook({ by: a })
    const hidden = await sharedBook({ by: b })

    await copyAs(a, { book: finished.id, acquiredAt: noonUtc(today), price: 1500 })
    await copyAs(a, { book: dusty.id, acquiredAt: noonUtc(today) })
    const removed = await copyAs(a, { book: gone.id, acquiredAt: noonUtc(today), price: 4000 })
    await upsertUserBook(asA, finished.id, { read: true, finishedAt: noonUtc(today) })
    await upsertUserBook(asA, gone.id, { read: true, finishedAt: noonUtc(today) })
    await removeCopies(asA, [removed.id])
    await copyAs(a, { book: orderedOld.id, acquiredAt: noonUtc('2003-01-01'), status: 'ordered' })
    await copyAs(a, { book: readingOld.id, acquiredAt: noonUtc('2004-01-01') })
    await copyAs(a, { book: readOld.id, acquiredAt: noonUtc('2005-01-01') })
    await upsertUserBook(asA, readingOld.id, { readingSince: noonUtc('2004-01-01') })
    await upsertUserBook(asA, readOld.id, { read: true })
    await upsertUserBook(asA, finished.id, { overrides: { pages: 150 } })
    // Owned and unread, then made private by its creator: unreadable to A.
    await copyAs(a, { book: hidden.id, acquiredAt: noonUtc('2002-01-01') })
    await (
      await getPayload({ config })
    ).update({
      collection: 'books',
      id: hidden.id,
      data: { visibility: 'private' },
      overrideAccess: true,
      req: asB.req,
    })

    await copyAs(b, { book: bRead.id, acquiredAt: noonUtc(today), price: 999 })
    await copyAs(b, { book: bReading.id, acquiredAt: noonUtc(today) })
    await copyAs(b, { book: finished.id, acquiredAt: noonUtc(today), price: 777 })
    await copyAs(b, { book: dusty.id, acquiredAt: noonUtc('2001-01-01') })
    await upsertUserBook(asB, bRead.id, { read: true, finishedAt: noonUtc(today) })
    await upsertUserBook(asB, bReading.id, { readingSince: noonUtc(today) })
    await upsertUserBook(asB, finished.id, { read: true, finishedAt: noonUtc(today) })

    const stats = await getStats(asA)
    const year = Number(today.slice(0, 4))
    expect(stats.reading.map((r) => r.book.bookId)).toEqual([readingOld.id])
    expect(stats.years).toEqual([year])
    expect(stats.byYear).toEqual([{ year, books: 1, pages: 150, spent: 1500 }])
    expect(stats.undated).toBe(1)
    expect(stats.year.thickest?.book.bookId).toBe(finished.id)
    expect(stats.year.mostExpensive).toMatchObject({ book: { bookId: finished.id }, price: 1500 })
    expect(stats.dust).toMatchObject({ book: { bookId: dusty.id }, since: today })
  })
})
