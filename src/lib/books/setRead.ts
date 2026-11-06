import { finishedDays as calendarDays, helsinkiToday } from '@/fields/readingDates'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import type { Undone } from '@/lib/undo/undo'

import { booksOfCopies } from './booksOfCopies'
import type { ReadState } from './effectiveBook'
import { readState } from './userBookState'
import { requireOwnBook } from './requireOwnBook'
import { upsertUserBook } from './upsertUserBook'

/** What `setRead()` marks: a selection of the viewer's copies, or one Book. */
export type ReadTarget = { copyIds: readonly number[] } | { bookId: number }

type ReadingValues = { read: boolean; readingSince: string | null; finishedAt: string | null }
type Changed = { bookId: number; previous: ReadingValues }

/**
 * AD-18/20: apply reading transitions to the distinct owned Books atomically.
 * Every copy id is validated before any write; Book ids pass requireOwnBook.
 * Toggle clears an all-read selection and marks any other selection read.
 * Only changed Books are written and captured for Undo, with all three values.
 */
export async function setRead(
  ctx: Context,
  target: ReadTarget,
  value: ReadState | 'toggle',
): Promise<Undone<{ state: ReadState; count: number; finishedDays: number | null }>> {
  return withTransaction(ctx, async (tx) => {
    let bookIds: number[]
    if ('copyIds' in target) {
      bookIds = await booksOfCopies(tx, target.copyIds)
    } else {
      await requireOwnBook(tx, target.bookId)
      bookIds = [target.bookId]
    }

    // `user-books` access already scopes the find to the viewer (AD-6).
    const { docs } = await gateway.find(tx, {
      collection: 'user-books',
      where: { book: { in: bookIds } },
      select: { book: true, read: true, readingSince: true, finishedAt: true },
      depth: 0,
      pagination: false,
    })
    const rows = new Map(docs.map((row) => [idOf(row.book), row]))
    const state =
      value === 'toggle'
        ? bookIds.every((id) => readState(rows.get(id)) === 'read')
          ? 'unread'
          : 'read'
        : value
    const today = helsinkiToday()
    let finishedDays: number | null = null
    const changed: Changed[] = []
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const bookId of bookIds) {
      const row = rows.get(bookId)
      const previousState = readState(row)
      if (previousState === state) continue
      const previous: ReadingValues = {
        read: row?.read ?? false,
        readingSince: row?.readingSince ?? null,
        finishedAt: row?.finishedAt ?? null,
      }
      let next: ReadingValues
      if (state === 'unread') {
        next = { read: false, readingSince: null, finishedAt: null }
      } else if (state === 'reading') {
        next = { read: false, readingSince: previous.readingSince ?? today, finishedAt: null }
      } else {
        next = { ...previous, read: true, finishedAt: previousState === 'reading' ? today : null }
        if (previousState === 'reading' && previous.readingSince) {
          finishedDays = calendarDays(previous.readingSince.slice(0, 10), today)
        }
      }
      await upsertUserBook(tx, bookId, next)
      changed.push({ bookId, previous })
    }
    return {
      data: {
        state,
        count: bookIds.length,
        finishedDays: changed.length === 1 ? finishedDays : null,
      },
      restore: (rtx) => restoreRead(rtx, changed),
    }
  })
}

// `count` first: a failed write would end the transaction.
async function restoreRead(ctx: Context, changed: Changed[]): Promise<void> {
  await withTransaction(ctx, async (tx) => {
    for (const { bookId, previous } of changed) {
      const { totalDocs } = await gateway.count(tx, {
        collection: 'user-books',
        where: { book: { equals: bookId } },
      })
      if (totalDocs === 0) continue
      await upsertUserBook(tx, bookId, previous)
    }
  })
}
