import { normaliseIsbn } from '@/fields/isbn'
import type { Named } from '@/lib/books/effectiveBook'
import { createCopy } from '@/lib/copies/createCopy'
import { DomainError } from '@/lib/errors'
import { lookupSources } from '@/lib/metadata/lookup'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { type Undoable, type Undone, withUndo } from '@/lib/undo/undo'

import { storeCover } from './covers'
import { createPrivateBook, type ManualEntry, normaliseManual } from './createPrivateBook'
import { ensureSharedBook } from './ensureSharedBook'
import { findBookByIsbn } from './findBookByIsbn'
import { type CandidateId, chooseCandidate } from './pick'
import { oncePerRequest } from './saveRequests'
import { prepareShare, settleHeldBook } from './sharePrivateBook'

// Spine, Structural Seed (Shared shapes, `src/lib/catalogue`), narrowed to
// what exists now: the `{ bookId }` target arrives with `requireOwnBook()`
// (Story 4.1), and wishlist entries with Epic 7.

export type SaveInput = {
  requestId: string
  target: { isbn13: string; pick?: number; candidate?: CandidateId } | { manual: ManualEntry }
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
 * private Book with it, else a shared Book `ensureSharedBook()` creates.
 * Another user's private Book is never used. For that creation the save
 * resolves the sources' outcome once, before the transaction opens:
 * `lookupSources()`, which answers from the in-process cache and asks the
 * sources only on a miss (AD-9, AD-11). No source is called inside the
 * transaction. `chooseCandidate()` takes the candidate (D-7): the one with
 * `candidate`'s `source` and `recordId`, or `NOT_FOUND` when the outcome
 * lacks it, never another one; without `candidate`, `pick` by `pickIndex()`
 * (none or out of range is the best). Its cover is stored by `storeCover()`
 * before the transaction opens (AD-14), and the Book keeps the ISBN asked for.
 *
 * A held Book goes through `settleHeldBook()` in the save's transaction
 * (FR-12, AD-4, AD-5, D-8). The user's private Book is shared in place when
 * the in-process cache holds a `found` outcome for the ISBN
 * (`prepareShare()`, which also stores the candidate's cover beforehand when
 * the Book has none): it keeps its id and takes the values of the candidate
 * `chooseCandidate()` takes for `pick` and `candidate`.
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
 * `withUndo()` refuses. Errors pass through unchanged (`NOT_FOUND` when no
 * source knows the ISBN or the candidate has gone, with nothing written and
 * no cover stored; a plain `Error` when the sources are unavailable;
 * `createCopy()`'s `ValidationError`); a rollback removes every row written
 * and the stored cover file.
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
    // AD-11: the one outcome this save uses, resolved before the transaction.
    const outcome = await lookupSources(isbn13)
    if (outcome.kind === 'none') throw new DomainError('NOT_FOUND')
    if (outcome.kind === 'unavailable') {
      throw new Error(`Sources unavailable: ${outcome.failed.join(', ')}`)
    }
    const chosen = chooseCandidate(outcome, target.pick, target.candidate)
    const { coverUrl } = chosen.candidate
    const cover = coverUrl === undefined ? undefined : await storeCover(ctx, isbn13, coverUrl)
    return withUndo(ctx, async (tx) => {
      // A shared Book created between the read and here is found again by
      // `ensureSharedBook()`, which then discards the cover and ignores `chosen`.
      const book = await ensureSharedBook(tx, isbn13, chosen, cover)
      return saveOwnedCopy(tx, book.data.id, book)
    })
  }

  // FR-12, D-8: a held private Book may be shared, or merged into a shared Book.
  const pending = await prepareShare(ctx, isbn13, held, target.pick, target.candidate)
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
