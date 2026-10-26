import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf, isRowId } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import type { Undone } from '@/lib/undo/undo'

import { requireOwnBook } from './requireOwnBook'
import { upsertUserBook } from './upsertUserBook'

/** What `setRead()` marks: a selection of the viewer's copies, or one Book. */
export type ReadTarget = { copyIds: readonly number[] } | { bookId: number }

type Changed = { bookId: number; previous: boolean }

/**
 * Spine, AD-18 and AD-20: marks the target's distinct Books read or unread
 * for the context user, in the caller's transaction or one of its own
 * (AD-16), and resolves to the value set and the number of distinct Books,
 * with the restore that puts each changed flag back. Records nothing:
 * callers wrap it in `withUndo()`.
 *
 * Copy ids: duplicates count once. An empty list, an id that is not a
 * row id (`isRowId()`), or one that is not the viewer's (a gone copy, or
 * another user's, for the admin too) fails with `NOT_FOUND` before any write;
 * the find filters on `owner` explicitly as well as through `ownerAccess`
 * (FR-48). The Books are those copies' distinct `book` ids. A Book id passes
 * `requireOwnBook()` (AD-7) first.
 *
 * A Book without a `user-books` row is unread. `toggle` resolves to `false`
 * when every target Book is read, otherwise to `true`. A Book already at the
 * value is not written and not in the restore; the others are written through
 * `upsertUserBook()`, one after the other. The restore closes over the
 * changed Books' ids and previous flags, and skips a Book whose row is gone.
 * It never deletes a row the action created: `read: false` reads as none.
 */
export async function setRead(
  ctx: Context,
  target: ReadTarget,
  value: boolean | 'toggle',
): Promise<Undone<{ read: boolean; count: number }>> {
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
      select: { book: true, read: true },
      depth: 0,
      pagination: false,
    })
    const readBooks = new Set(docs.filter((row) => row.read).map((row) => idOf(row.book)))
    const read = value === 'toggle' ? !bookIds.every((id) => readBooks.has(id)) : value

    const changed: Changed[] = []
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const bookId of bookIds) {
      const previous = readBooks.has(bookId)
      if (previous === read) continue
      await upsertUserBook(tx, bookId, { read })
      changed.push({ bookId, previous })
    }
    return {
      data: { read, count: bookIds.length },
      restore: (rtx) => restoreRead(rtx, changed),
    }
  })
}

async function booksOfCopies(tx: Context, copyIds: readonly number[]): Promise<number[]> {
  const ids = [...new Set(copyIds)]
  if (ids.length === 0 || !ids.every(isRowId)) {
    throw new DomainError('NOT_FOUND')
  }
  const { docs } = await gateway.find(tx, {
    collection: 'copies',
    where: { and: [{ id: { in: ids } }, { owner: { equals: tx.user.id } }] },
    select: { book: true },
    depth: 0,
    pagination: false,
  })
  if (docs.length < ids.length) throw new DomainError('NOT_FOUND')
  return [...new Set(docs.map((doc) => idOf(doc.book)))]
}

// `count` first: a failed write would end the transaction.
async function restoreRead(ctx: Context, changed: Changed[]): Promise<void> {
  for (const { bookId, previous } of changed) {
    const { totalDocs } = await gateway.count(ctx, {
      collection: 'user-books',
      where: { book: { equals: bookId } },
    })
    if (totalDocs === 0) continue
    await upsertUserBook(ctx, bookId, { read: previous })
  }
}
