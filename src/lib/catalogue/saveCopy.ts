import { normaliseIsbn } from '@/fields/isbn'
import type { Named } from '@/lib/books/effectiveBook'
import { createCopy } from '@/lib/copies/createCopy'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { type Undoable, withUndo } from '@/lib/undo/undo'

import { downloadCover } from './covers'
import { ensureSharedBook } from './ensureSharedBook'
import { findBookByIsbn } from './findBookByIsbn'
import { oncePerRequest } from './saveRequests'

// Spine, Structural Seed (Shared shapes, `src/lib/catalogue`), narrowed to
// what exists now: the `{ bookId }` target arrives with `requireOwnBook()`
// (Story 4.1), `{ manual }` with 3.38, `pick` with 3.53, and wishlist entries
// with Epic 7.

export type SaveInput = {
  requestId: string
  target: { isbn13: string }
  save: { kind: 'copy' }
}

/** The saved Book and copy, and where the copy landed (`null`: no location). */
export type SaveResult = { bookId: number; copyId: number; savedTo: Named | null }

/**
 * Spine, AD-11 and FR-21: Add to library. Saves the Book and an owned copy at
 * the user's default location in one transaction, or nothing at all.
 *
 * The ISBN is normalised first (`INVALID_ISBN` before any read). The Book is
 * the shared Book with the ISBN, else the user's own private Book with it,
 * else a shared Book `ensureSharedBook()` creates from the server-held source
 * outcome. Another user's private Book is never used. Only in that last case
 * is the cover downloaded, before the transaction opens (AD-14); an existing
 * Book gets no download and no source call.
 *
 * A repeat of a recent `requestId` by the same user returns the first result
 * and writes nothing, even with another `target`: the id identifies the press
 * (AD-11, AD-12, `oncePerRequest()`). A failed save is not remembered, so a
 * retry runs again. A `requestId` that is not 1–64 characters fails with
 * `VALIDATION` before any read.
 *
 * `saveCopy` opens the transaction itself and cannot be called inside one:
 * `downloadCover()` refuses. Errors pass through unchanged (`NOT_FOUND`, a
 * plain `Error` when the sources are unavailable, `createCopy()`'s
 * `ValidationError`); a rollback removes every row written and the
 * downloaded cover file.
 *
 * Undo (AD-11, AD-20): the transaction is `withUndo()`'s, so the result
 * carries an `undoToken` and the whole seconds left on it, and `undo()` with
 * the token deletes the copy, then the rows `ensureSharedBook()` created that
 * no row of any user references any more. A Book that existed before the
 * save stays, even when nothing references it. A repeat of the `requestId`
 * records no second receipt: it returns the first token with the seconds left
 * now. An Undo keeps the `requestId` remembered, so a retry within the window
 * returns the undone result and saves nothing.
 */
export async function saveCopy(ctx: Context, input: SaveInput): Promise<Undoable<SaveResult>> {
  const { result, storedAt } = await oncePerRequest(ctx, input.requestId, async () => {
    const saved = await save(ctx, input)
    return { result: saved, storedAt: Date.now() }
  })
  const elapsed = Math.floor((Date.now() - storedAt) / 1000)
  return { ...result, undoSeconds: Math.max(0, result.undoSeconds - elapsed) }
}

async function save(ctx: Context, input: SaveInput): Promise<Undoable<SaveResult>> {
  const isbn13 = normaliseIsbn(input.target.isbn13)

  const held = await findBookByIsbn(ctx, isbn13)
  const cover = held ? undefined : await downloadCover(ctx, isbn13)

  return withUndo(ctx, async (tx) => {
    // A shared Book created between the read and here is found again by
    // `ensureSharedBook()`, which then discards the cover.
    const book = held ? undefined : await ensureSharedBook(tx, isbn13, cover)
    const bookId = held ? held.id : book!.data.id
    const copy = await createCopy(tx, { bookId, status: 'owned' })
    const copyId = copy.data
    const row = await gateway.findByID(tx, {
      collection: 'copies',
      id: copyId,
      depth: 1,
      select: { location: true },
      populate: { locations: { name: true } },
    })
    const { location } = row
    const savedTo =
      typeof location === 'object' && location !== null
        ? { id: location.id, name: location.name }
        : null
    return {
      data: { bookId, copyId, savedTo },
      // The copy first, so the Book it referenced can be found unreferenced.
      restore: async (rtx) => {
        await copy.restore(rtx)
        await book?.restore(rtx)
      },
    }
  })
}
