import { normaliseIsbn } from '@/fields/isbn'
import type { Named } from '@/lib/books/effectiveBook'
import { createCopy } from '@/lib/copies/createCopy'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { withTransaction } from '@/lib/payload/transaction'

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
 */
export function saveCopy(ctx: Context, input: SaveInput): Promise<SaveResult> {
  return oncePerRequest(ctx, input.requestId, () => save(ctx, input))
}

async function save(ctx: Context, input: SaveInput): Promise<SaveResult> {
  const isbn13 = normaliseIsbn(input.target.isbn13)

  const held = await findBookByIsbn(ctx, isbn13)
  const cover = held ? undefined : await downloadCover(ctx, isbn13)

  return withTransaction(ctx, async (tx) => {
    // A shared Book created between the read and here is found again by
    // `ensureSharedBook()`, which then discards the cover.
    const bookId = held ? held.id : (await ensureSharedBook(tx, isbn13, cover)).id
    const copyId = await createCopy(tx, { bookId, status: 'owned' })
    const copy = await gateway.findByID(tx, {
      collection: 'copies',
      id: copyId,
      depth: 1,
      select: { location: true },
      populate: { locations: { name: true } },
    })
    const { location } = copy
    const savedTo =
      typeof location === 'object' && location !== null
        ? { id: location.id, name: location.name }
        : null
    return { bookId, copyId, savedTo }
  })
}
