'use server'

import { setRating } from '@/lib/books/setRating'
import { setRead } from '@/lib/books/setRead'
import { removeCopies } from '@/lib/copies/removeCopies'
import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { withUndo, type Undoable } from '@/lib/undo/undo'

// The collection's actions: select mode and Book detail (AD-18). Client input
// is checked here, never repaired: an id that is not a positive safe integer,
// or a value of the wrong type, is `VALIDATION` with no write. Ownership is
// the service's. An undoable action returns its receipt (AD-20) for the
// client's success toast; the client reports the result through `afterAction`.

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const ids = (value: unknown): number[] => {
  if (!Array.isArray(value) || !value.every(isId)) throw new DomainError('VALIDATION')
  return value
}

/** `input` as an object with a valid `bookId`, its other fields unchecked; `VALIDATION` otherwise. */
function bookInput(input: unknown): Record<string, unknown> & { bookId: number } {
  if (typeof input !== 'object' || input === null) throw new DomainError('VALIDATION')
  const fields = input as Record<string, unknown>
  if (!isId(fields.bookId)) throw new DomainError('VALIDATION')
  return { ...fields, bookId: fields.bookId }
}

/** Removes the viewer's copies, all or none: one not theirs fails `NOT_FOUND`. No Undo. */
export async function removeCopiesAction(copyIds: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await removeCopies(ctx, ids(copyIds))
    return null
  })
}

/** Book detail's read switch: marks one Book read or unread, with Undo. */
export async function setReadAction(
  input: unknown,
): Promise<ActionResult<Undoable<{ read: boolean; count: number }>>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const { bookId, read } = bookInput(input)
    if (typeof read !== 'boolean') throw new DomainError('VALIDATION')
    return withUndo(ctx, (tx) => setRead(tx, { bookId }, read))
  })
}

/**
 * Book detail's Rating: rates one Book, or clears it with `null`. No Undo.
 * The range and whole-number checks are the collection's (`VALIDATION`).
 */
export async function setRatingAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const { bookId, rating } = bookInput(input)
    if (rating !== null && typeof rating !== 'number') throw new DomainError('VALIDATION')
    await setRating(ctx, bookId, rating)
    return null
  })
}

/**
 * AD-18: toggles read on the distinct Books of the viewer's copies: read, or
 * unread when all are read already. `count` is those Books. Undoable (AD-20).
 */
export async function toggleCopiesReadAction(
  copyIds: unknown,
): Promise<ActionResult<Undoable<{ read: boolean; count: number }>>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const copies = ids(copyIds)
    return withUndo(ctx, (tx) => setRead(tx, { copyIds: copies }, 'toggle'))
  })
}
