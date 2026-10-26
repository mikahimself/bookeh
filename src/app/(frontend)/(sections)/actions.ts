'use server'

import { setRating } from '@/lib/books/setRating'
import type { Named } from '@/lib/books/effectiveBook'
import { setRead } from '@/lib/books/setRead'
import { refetchBook, type RefetchResult } from '@/lib/catalogue/refetchBook'
import { listLocations, type LocationOption } from '@/lib/copies/locations'
import { moveCopies } from '@/lib/copies/moveCopies'
import { receiveCopy } from '@/lib/copies/receiveCopy'
import { removeCopies, type RemoveResult } from '@/lib/copies/removeCopies'
import { setNote } from '@/lib/copies/updateCopy'
import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { isRowId } from '@/lib/payload/ref'
import { withUndo, type Undoable } from '@/lib/undo/undo'

import { parseRef } from '../ref'

// The collection's actions: select mode and Book detail (AD-18). Client input
// is checked here, never repaired: an id that is not a row id (`isRowId()`),
// or a value of the wrong type, is `VALIDATION` with no write. Ownership is
// the service's. An undoable action returns its receipt (AD-20) for the
// client's success toast; the client reports the result through `afterAction`.

const ids = (value: unknown): number[] => {
  if (!Array.isArray(value) || !value.every(isRowId)) throw new DomainError('VALIDATION')
  return value
}

/** `input` as an object with a valid `bookId`, its other fields unchecked; `VALIDATION` otherwise. */
function bookInput(input: unknown): Record<string, unknown> & { bookId: number } {
  if (typeof input !== 'object' || input === null) throw new DomainError('VALIDATION')
  const fields = input as Record<string, unknown>
  if (!isRowId(fields.bookId)) throw new DomainError('VALIDATION')
  return { ...fields, bookId: fields.bookId }
}

/** `input` as an object with a valid `copyId`, its other fields unchecked; `VALIDATION` otherwise. */
function copyInput(input: unknown): Record<string, unknown> & { copyId: number } {
  if (typeof input !== 'object' || input === null) throw new DomainError('VALIDATION')
  const fields = input as Record<string, unknown>
  if (!isRowId(fields.copyId)) throw new DomainError('VALIDATION')
  return { ...fields, copyId: fields.copyId }
}

/**
 * Removes the viewer's owned copies: one not theirs fails `NOT_FOUND`, an
 * ordered one is skipped and named in `skipped`, so the bar can leave it
 * ticked. No Undo.
 */
export async function removeCopiesAction(copyIds: unknown): Promise<ActionResult<RemoveResult>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    return removeCopies(ctx, ids(copyIds))
  })
}

/**
 * Book detail's copy note: sets the note of one of the viewer's copies. No
 * Undo. Trimming, the empty note and the length limit are the service's.
 */
export async function setNoteAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const { copyId, note } = copyInput(input)
    if (typeof note !== 'string') throw new DomainError('VALIDATION')
    await setNote(ctx, copyId, note)
    return null
  })
}

/**
 * Book detail's Received: makes one of the viewer's ordered copies owned at
 * their default location, with Undo. `savedTo` is where it landed, or `null`.
 */
export async function receiveCopyAction(
  input: unknown,
): Promise<ActionResult<Undoable<{ savedTo: Named | null }>>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const { copyId } = copyInput(input)
    return withUndo(ctx, (tx) => receiveCopy(tx, copyId))
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
 * Book detail's admin Re-fetch: fills a shared Book's empty fields from the
 * sources (FR-19). No Undo. The gate is the service's (`NOT_FOUND`).
 */
export async function refetchBookAction(input: unknown): Promise<ActionResult<RefetchResult>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const { bookId } = bookInput(input)
    return refetchBook(ctx, bookId)
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

/**
 * FR-33, AD-18: moves the viewer's owned copies to one location, an id or
 * `{ create }`, with Undo (AD-20). No `null`: the collection offers no "no
 * location". Answers the target as the toast names it, read in the move's
 * transaction (`null` only when nothing was owned and so nothing created),
 * `count`, the copies actually written, and `skipped`, the ordered copies
 * left alone, so the bar can leave them ticked.
 */
export async function moveCopiesAction(
  input: unknown,
): Promise<
  ActionResult<Undoable<{ location: LocationOption | null; count: number; skipped: number[] }>>
> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (typeof input !== 'object' || input === null) throw new DomainError('VALIDATION')
    const fields = input as Record<string, unknown>
    const copies = ids(fields.copyIds)
    const location = parseRef(fields.location)
    if (location === undefined) throw new DomainError('VALIDATION')
    return withUndo(ctx, async (tx) => {
      const { data, restore } = await moveCopies(tx, copies, location)
      const target =
        data.location === null
          ? null
          : (await listLocations(tx)).find(({ id }) => id === data.location)
      if (target === undefined) throw new Error('moveCopies() answered no location of the viewer')
      return { data: { location: target, count: data.moved, skipped: data.skipped }, restore }
    })
  })
}
