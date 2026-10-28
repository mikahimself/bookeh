import { normaliseIsbn } from '@/fields/isbn'
import type { Named } from '@/lib/books/effectiveBook'
import { requireOwnBook } from '@/lib/books/requireOwnBook'
import { createCopy } from '@/lib/copies/createCopy'
import { DomainError } from '@/lib/errors'
import { heldOutcome, lookupSources } from '@/lib/metadata/lookup'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import type { Ref } from '@/lib/payload/ref'
import { type Undoable, type Undone, withUndo } from '@/lib/undo/undo'
import { closeEntriesForBook, createEntry } from '@/lib/wishlists/entries'

import { storeCover } from './covers'
import { createPrivateBook, type ManualEntry, normaliseManual } from './createPrivateBook'
import { ensureSharedBook } from './ensureSharedBook'
import { findBookByIsbn } from './findBookByIsbn'
import { limitLookups } from './lookupLimit'
import { type CandidateId, chooseCandidate } from './pick'
import { oncePerRequest, type SaveKind } from './saveRequests'
import { prepareShare, settleHeldBook } from './sharePrivateBook'

// Spine, Structural Seed (Shared shapes, `src/lib/catalogue`).

/** What a save is for: a Book by ISBN, typed by hand, or one the user holds. */
export type SaveTarget =
  | { isbn13: string; pick?: number; candidate?: CandidateId }
  | { manual: ManualEntry }
  | { bookId: number }

type SaveOf<S> = { requestId: string; target: SaveTarget; save: S }

/** Add to library. */
export type CopySaveInput = SaveOf<{ kind: 'copy' }>
/** Add to wishlist. */
export type EntrySaveInput = SaveOf<{ kind: 'entry'; wishlist: Ref }>
export type SaveInput = CopySaveInput | EntrySaveInput

/** The saved Book and copy, and where the copy landed (`null`: no location). */
export type SaveResult = { bookId: number; copyId: number; savedTo: Named | null }

/** The saved Book and entry, and the list it landed on. */
export type EntrySaveResult = { bookId: number; entryId: number; savedTo: Named }

/**
 * Spine, AD-11 and FR-21: Add to library. Saves the Book and an owned copy at
 * the user's default location in one transaction, or nothing at all.
 *
 * An `{ isbn13 }` target is normalised first (`INVALID_ISBN` before any
 * read). The Book is the shared Book with the ISBN, else the user's own
 * private Book with it, else a shared Book `ensureSharedBook()` creates.
 * Another user's private Book is never used. For that creation the save
 * resolves the sources' outcome once, before the transaction opens: the
 * server-held outcome (`heldOutcome()`), else `lookupSources()` (AD-9,
 * AD-11). Only that miss counts one lookup against the user's limit
 * (`limitLookups()`, `RATE_LIMITED` before any source is asked). No source is
 * called inside the transaction. `chooseCandidate()` takes the candidate
 * (D-7): the one with `candidate`'s `source` and `recordId`, or `NOT_FOUND`
 * when the outcome lacks it, never another one; without `candidate`, `pick`
 * by `pickIndex()` (none or out of range is the best). Its cover is stored by `storeCover()`
 * before the transaction opens (AD-14), and the Book keeps the ISBN asked for.
 *
 * A held Book goes through `settleHeldBook()` in the save's transaction
 * (FR-12, AD-4, AD-5, D-8). The user's private Book is shared in place when
 * the in-process cache holds a `found` outcome for the ISBN
 * (`prepareShare()`, which also stores the candidate's cover beforehand when
 * the Book has none): it keeps its id and takes the values of the candidate
 * `chooseCandidate()` takes for `pick` and `candidate`.
 * When a shared Book with the ISBN exists and the user also has a private
 * one, the private Book merges into it: its copies, the user's wishlist
 * entries and the user's row move,
 * and it is deleted, the save failing when anything else still references
 * it. Either way the user's hand-entered values that differ beyond case,
 * whitespace and punctuation become their overrides; an admin's are dropped.
 * The private authors, series and cover left unreferenced are deleted.
 * Otherwise the held Book gets the copy unchanged. A held Book's save never
 * asks the sources.
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
 * A `{ bookId }` target (AD-7, AD-11) saves one more owned copy of a Book the
 * user already holds. `requireOwnBook()` guards it in the save's transaction:
 * `NOT_FOUND`, with nothing written, unless the user has a copy or an open
 * wishlist entry of the Book. It never asks the sources and changes nothing
 * on the Book: no auto-share or merge, which are keyed on the ISBN and run
 * on an `{ isbn13 }` save (AD-5). The target is for Books without an ISBN (I12); an Answer for a
 * Book with one sends `{ isbn13 }`. A held Book the user can no longer read
 * (a shared Book the admin made private) fails in `createCopy()`.
 *
 * For every target, before the copy is created and in the same transaction,
 * the user's own open wishlist entries for the saved Book (no recipient) are
 * closed (`closeEntriesForBook()`, FR-28, AD-18). Entries for a Person,
 * closed entries and other users' entries stay. After a merge that is the
 * shared Book, so the user's entries moved from the private Book close there.
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
 * no cover stored; `RATE_LIMITED` when asking the sources would pass the
 * user's lookup limit, with nothing written; a plain `Error` when the sources
 * are unavailable;
 * `createCopy()`'s `ValidationError`); a rollback removes every row written
 * and the stored cover file.
 *
 * Undo (AD-11, AD-20): the transaction is `withUndo()`'s, so the result
 * carries an `undoToken` and the whole seconds left on it, and `undo()` with
 * the token deletes the copy, reopens the entries the save closed that still
 * exist, then deletes the rows `ensureSharedBook()` or `createPrivateBook()`
 * created that no row of any user references any more. A copy with a loan
 * fails the Undo with `UNDO_FAILED` and nothing changes: the undo
 * transaction rolls back.
 * A Book that existed before the save stays, even when nothing references
 * it, and a share or a merge is not undone: the Book stays shared, and the
 * moved copies, entries, the row and the overrides stay; reopened entries
 * stay on the shared Book. A repeat of the `requestId`
 * records no second receipt: it returns the first token with the seconds
 * left now. An Undo keeps the `requestId` remembered, so a retry within the
 * window returns the undone result and saves nothing.
 */
export async function saveCopy(ctx: Context, input: CopySaveInput): Promise<Undoable<SaveResult>> {
  return remembered(ctx, 'copy', input.requestId, () =>
    saveBook(ctx, input.target, (tx, bookId) => saveOwnedCopy(tx, bookId)),
  )
}

/**
 * Spine, AD-11, AD-18 and FR-21: Add to wishlist. Saves the Book exactly as
 * `saveCopy()` does, for each target with the same rules, errors and Undo of
 * the Book, then puts it on the user's wishlist `save.wishlist` as an open
 * entry for the user (`createEntry()`, no recipient) instead of saving a
 * copy. Book and entry are one transaction, or nothing at all. The list's
 * `Ref` is resolved inside it (`VALIDATION` on `wishlist`), so on a source
 * miss it fails after the lookup and the cover download, and the rollback
 * removes the cover. It never creates a copy or closes an entry.
 *
 * `requestId` is remembered apart from `saveCopy()`'s: a repeat of one by a
 * `saveEntry` returns the first `saveEntry` result and token, never a copy
 * save's. Undo deletes the entry, then the rows the save created that nothing
 * references any more; a list created by the `Ref` stays.
 */
export async function saveEntry(
  ctx: Context,
  input: EntrySaveInput,
): Promise<Undoable<EntrySaveResult>> {
  const { wishlist } = input.save
  return remembered(ctx, 'entry', input.requestId, () =>
    saveBook(ctx, input.target, async (tx, bookId) => {
      const entry = await createEntry(tx, { wishlist, bookId })
      return {
        data: { bookId, entryId: entry.data.entryId, savedTo: entry.data.wishlist },
        restore: entry.restore,
      }
    }),
  )
}

/**
 * `oncePerRequest()` with the Undo seconds counted down from the first save:
 * a repeat returns the first token with the seconds left now.
 */
async function remembered<R extends object>(
  ctx: Context,
  kind: SaveKind,
  requestId: string,
  save: () => Promise<Undoable<R>>,
): Promise<Undoable<R>> {
  const { result, storedAt } = await oncePerRequest(ctx, kind, requestId, async () => {
    const saved = await save()
    return { result: saved, storedAt: Date.now() }
  })
  const elapsed = Math.floor((Date.now() - storedAt) / 1000)
  return { ...result, undoSeconds: Math.max(0, result.undoSeconds - elapsed) }
}

/** What a save puts in place for the ensured Book, inside the save's transaction. */
type Place<R> = (tx: Context, bookId: number) => Promise<Undone<R>>

/**
 * Ensures the Book for `target` and runs `place` for it in one `withUndo()`
 * transaction. The restore runs `place`'s, then the restore of the Book this
 * save created, if any: the copy or entry first, so the Book it referenced
 * can be found unreferenced.
 */
async function saveBook<R extends object>(
  ctx: Context,
  target: SaveTarget,
  place: Place<R>,
): Promise<Undoable<R>> {
  const placed = async (
    tx: Context,
    bookId: number,
    book: Undone<unknown> | undefined,
  ): Promise<Undone<R>> => {
    const done = await place(tx, bookId)
    return {
      data: done.data,
      restore: async (rtx) => {
        await done.restore(rtx)
        await book?.restore(rtx)
      },
    }
  }

  if ('bookId' in target) {
    const { bookId } = target
    return withUndo(ctx, async (tx) => {
      await requireOwnBook(tx, bookId)
      return placed(tx, bookId, undefined)
    })
  }
  if ('manual' in target) {
    const manual = normaliseManual(target.manual)
    // No cover to fetch first, so the held-Book read runs in the transaction.
    return withUndo(ctx, async (tx) => {
      const held = manual.isbn13 === undefined ? undefined : await findBookByIsbn(tx, manual.isbn13)
      const book = held ? undefined : await createPrivateBook(tx, manual)
      return placed(tx, held ? held.id : book!.data.id, book)
    })
  }

  const isbn13 = normaliseIsbn(target.isbn13)

  const held = await findBookByIsbn(ctx, isbn13)
  if (!held) {
    // AD-11: the one outcome this save uses, resolved before the transaction.
    // AD-9: asking the sources counts against the user's lookup limit.
    let outcome = heldOutcome(isbn13)
    if (!outcome) {
      limitLookups(ctx)
      outcome = await lookupSources(isbn13)
    }
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
      return placed(tx, book.data.id, book)
    })
  }

  // FR-12, D-8: a held private Book may be shared, or merged into a shared Book.
  const pending = await prepareShare(
    ctx,
    isbn13,
    held,
    heldOutcome(isbn13),
    target.pick,
    target.candidate,
  )
  return withUndo(ctx, async (tx) => {
    const bookId = await settleHeldBook(tx, isbn13, pending)
    // No Book restore: a shared or merged Book stays shared after an Undo.
    return placed(tx, bookId, undefined)
  })
}

/**
 * The user's own open wishes for the Book closed (`closeEntriesForBook()`),
 * then the owned copy at the default location and where it landed, inside
 * the save's transaction. Its restore deletes the copy, then reopens the
 * entries. A lent copy fails the Undo with `UNDO_FAILED` and nothing
 * changes: the undo transaction rolls back.
 */
async function saveOwnedCopy(tx: Context, bookId: number): Promise<Undone<SaveResult>> {
  const closed = await closeEntriesForBook(tx, bookId)
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
    restore: async (rtx) => {
      await copy.restore(rtx)
      await closed.restore(rtx)
    },
  }
}
