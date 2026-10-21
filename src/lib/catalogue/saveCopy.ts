import { normaliseIsbn } from '@/fields/isbn'
import type { Named } from '@/lib/books/effectiveBook'
import { createCopy } from '@/lib/copies/createCopy'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { type Undoable, type Undone, withUndo } from '@/lib/undo/undo'

import { downloadCover } from './covers'
import { createPrivateBook, type ManualEntry, normaliseManual } from './createPrivateBook'
import { ensureSharedBook } from './ensureSharedBook'
import { findBookByIsbn } from './findBookByIsbn'
import { oncePerRequest } from './saveRequests'
import { prepareShare, settleHeldBook } from './sharePrivateBook'

// Spine, Structural Seed (Shared shapes, `src/lib/catalogue`), narrowed to
// what exists now: the `{ bookId }` target arrives with `requireOwnBook()`
// (Story 4.1), and wishlist entries with Epic 7.

export type SaveInput = {
  requestId: string
  target: { isbn13: string; pick?: number } | { manual: ManualEntry }
  save: { kind: 'copy' }
}

/** The saved Book and copy, and where the copy landed (`null`: no location). */
export type SaveResult = { bookId: number; copyId: number; savedTo: Named | null }

/**
 * Spine, AD-11 and FR-21: Add to library. Saves the Book and an owned copy at
 * the user's default location in one transaction, or nothing at all.
 *
 * An `{ isbn13 }` target is normalised first (`INVALID_ISBN` before any
 * read). The Book is the shared Book with the ISBN, else the user's own
 * private Book with it, else a shared Book `ensureSharedBook()` creates from
 * the server-held source outcome, its cover downloaded before the
 * transaction opens (AD-14). Another user's private Book is never used.
 * `pick` is the index of the source candidate that Book is made from (D-7):
 * `downloadCover()` and `ensureSharedBook()` apply `pickIndex()`, so none or
 * one out of range is the best, and the Book keeps the ISBN asked for. Only
 * that creation reads it: a Book found, held, shared or merged ignores it.
 *
 * A held Book goes through `settleHeldBook()` in the save's transaction
 * (FR-12, AD-4, AD-5, D-8). The user's private Book is shared in place when
 * the in-process cache holds a `found` outcome for the ISBN
 * (`prepareShare()`, which also stores the candidate's cover beforehand when
 * the Book has none): it keeps its id and takes the best candidate's values.
 * When a shared Book with the ISBN exists and the user also has a private
 * one, the private Book merges into it: its copies and the user's row move,
 * and it is deleted. Either way the user's differing hand-entered values
 * become their overrides; an admin's are dropped. Otherwise the held Book
 * gets the copy unchanged. A held Book's save never asks the sources.
 *
 * A `{ manual }` target (FR-12, FR-22, AD-4, AD-5) is normalised first by
 * `normaliseManual()` (`VALIDATION` marking `title` and `authors` blank or
 * `TOO_LONG`, then `INVALID_ISBN`, before any read). Then, in the save's transaction: with an
 * ISBN, a Book the user holds for it (shared, else their own private Book)
 * gets the copy and the typed values are dropped: one ISBN leads to one Book.
 * Otherwise `createPrivateBook()` makes a private Book from the typed title
 * and authors; without an ISBN that is always a new Book, never merged. A
 * manual save never asks the sources and downloads no cover.
 *
 * A repeat of a recent `requestId` by the same user returns the first result
 * and writes nothing, even with another `target`: the id identifies the press
 * (AD-11, AD-12, `oncePerRequest()`). A failed save is not remembered, so a
 * retry runs again. A `requestId` that is not 1–64 characters fails with
 * `VALIDATION` before any read.
 *
 * `saveCopy` opens the transaction itself and cannot be called inside one:
 * `withUndo()` refuses. Errors pass through unchanged (`NOT_FOUND`, a plain
 * `Error` when the sources are unavailable, `createCopy()`'s
 * `ValidationError`); a rollback removes every row written and the
 * downloaded cover file.
 *
 * Undo (AD-11, AD-20): the transaction is `withUndo()`'s, so the result
 * carries an `undoToken` and the whole seconds left on it, and `undo()` with
 * the token deletes the copy, then the rows `ensureSharedBook()` or
 * `createPrivateBook()` created that no row of any user references any more.
 * A Book that existed before the save stays, even when nothing references
 * it, and a share or a merge is not undone: the Book stays shared, and the
 * moved copies, the row and the overrides stay. A repeat of the `requestId`
 * records no second receipt: it returns the first token with the seconds
 * left now. An Undo keeps the `requestId` remembered, so a retry within the
 * window returns the undone result and saves nothing.
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
  const { target } = input
  if ('manual' in target) {
    const manual = normaliseManual(target.manual)
    // No cover to fetch first, so the held-Book read runs in the transaction.
    return withUndo(ctx, async (tx) => {
      const held = manual.isbn13 === undefined ? undefined : await findBookByIsbn(tx, manual.isbn13)
      const book = held ? undefined : await createPrivateBook(tx, manual)
      return saveOwnedCopy(tx, held ? held.id : book!.data.id, book)
    })
  }

  const isbn13 = normaliseIsbn(target.isbn13)

  const held = await findBookByIsbn(ctx, isbn13)
  if (!held) {
    const cover = await downloadCover(ctx, isbn13, undefined, target.pick)
    return withUndo(ctx, async (tx) => {
      // A shared Book created between the read and here is found again by
      // `ensureSharedBook()`, which then discards the cover and ignores `pick`.
      const book = await ensureSharedBook(tx, isbn13, cover, target.pick)
      return saveOwnedCopy(tx, book.data.id, book)
    })
  }

  // FR-12, D-8: a held private Book may be shared, or merged into a shared Book.
  const pending = await prepareShare(ctx, isbn13, held)
  return withUndo(ctx, async (tx) => {
    const bookId = await settleHeldBook(tx, isbn13, pending)
    // No Book restore: a shared or merged Book stays shared after an Undo.
    return saveOwnedCopy(tx, bookId, undefined)
  })
}

/**
 * The owned copy at the default location and where it landed, inside the
 * save's transaction. Its restore deletes the copy, then runs `book`'s (the
 * Book this save created, if any).
 */
async function saveOwnedCopy(
  tx: Context,
  bookId: number,
  book: Undone<unknown> | undefined,
): Promise<Undone<SaveResult>> {
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
}
