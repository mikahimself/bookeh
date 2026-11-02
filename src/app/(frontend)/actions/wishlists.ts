'use server'

import { type EntrySaveResult, saveEntry, type SaveTarget } from '@/lib/catalogue/saveCopy'
import { DomainError, logger, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { isRowId, type Ref } from '@/lib/payload/ref'
import { withUndo, type Undoable } from '@/lib/undo/undo'
import {
  closeEntry,
  removeEntry,
  setEntryRecipient,
  type ClosedEntry,
} from '@/lib/wishlists/entries'
import { createWishlist, deleteWishlist, renameWishlist } from '@/lib/wishlists/wishlists'

import { parseRef } from '../ref'
import { manualFields, parseTarget } from '../saveInput'

// The Wishlists section, one wishlist and its opened entry (FR-38, FR-39),
// and Add to wishlist from the Answer and Book detail (`saveEntryAction`).
// Client input is checked here, never repaired: a name must be a string, an
// id a row id (`isRowId()`) and a recipient `null` or a `Ref` (`parseRef()`),
// else `VALIDATION` with no write. Normalising, the blank and length checks,
// resolving a Person and ownership are `lib/wishlists`'s. The client
// refreshes or navigates on success. Bought and Ordered are undoable (AD-20)
// and toast, as is `saveEntryAction`, which has its own checks; everything
// else, Remove included, has no Undo and no toast.

const name = (value: unknown): string => {
  if (typeof value !== 'string') throw new DomainError('VALIDATION')
  return value
}

const id = (value: unknown): number => {
  if (!isRowId(value)) throw new DomainError('VALIDATION')
  return value
}

/** "New list": adds a wishlist; a name in use fails `NAME_TAKEN` with its id as `conflictId`. */
export async function createWishlistAction(value: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await createWishlist(ctx, name(value))
    return null
  })
}

/** Renames one of the viewer's lists; another list's name fails `NAME_TAKEN`. */
export async function renameWishlistAction(
  list: unknown,
  value: unknown,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await renameWishlist(ctx, id(list), name(value))
    return null
  })
}

/** Deletes one of the viewer's lists with all its entries; a list that is gone fails `NOT_FOUND`. */
export async function deleteWishlistAction(list: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await deleteWishlist(ctx, id(list))
    return null
  })
}

/** A recipient from the client: `null` (for the viewer), or a `Ref` to a Person. */
const recipient = (value: unknown): Ref | null => {
  if (value === null) return null
  const ref = parseRef(value)
  if (ref === undefined) throw new DomainError('VALIDATION')
  return ref
}

/**
 * The opened entry's "For": sets, changes or clears the recipient of one of
 * the viewer's open entries, at once. Resolves to the recipient's Person id
 * (a typed name matched or created), `null` once cleared. An entry that is
 * gone, closed or another user's fails `NOT_FOUND`; a bad name `VALIDATION`
 * on `person`.
 */
export async function setEntryRecipientAction(
  entry: unknown,
  person: unknown,
): Promise<ActionResult<number | null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const entryId = id(entry)
    const ref = recipient(person)
    return setEntryRecipient(ctx, entryId, ref)
  })
}

/** How an entry closes: Bought or Ordered. */
const closing = (value: unknown): 'bought' | 'ordered' => {
  if (value !== 'bought' && value !== 'ordered') throw new DomainError('VALIDATION')
  return value
}

/**
 * FR-28: Bought or Ordered on one of the viewer's open entries, with Undo.
 * The viewer's own entry gets an owned copy at the default location (Bought)
 * or an ordered copy (Ordered); a Person's entry gets none (`copyId` null).
 * An entry that is gone, closed or another user's fails `NOT_FOUND`.
 */
export async function closeEntryAction(
  entry: unknown,
  as: unknown,
): Promise<ActionResult<Undoable<ClosedEntry>>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const entryId = id(entry)
    const how = closing(as)
    return withUndo(ctx, (tx) => closeEntry(tx, entryId, how))
  })
}

/**
 * Remove, confirmed by the client: deletes one of the viewer's open entries;
 * the Book stays. No Undo. An entry that is gone, closed or another user's
 * fails `NOT_FOUND`.
 */
export async function removeEntryAction(entry: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await removeEntry(ctx, id(entry))
    return null
  })
}

/**
 * Add to wishlist on the Not in library and Not found Answers and in Book
 * detail (FR-21, FR-22, UX-DR46): the Book on the user's wishlist `wishlist`
 * as an open entry for the user (`saveEntry()`). The input comes from the
 * client, so anything but `{ requestId, wishlist, target }` with a string
 * `requestId`, a `Ref` `wishlist` (`parseRef()`) and a `target` that is the
 * ISBN's (`{ isbn13 }` with `pick` and `candidate` checked as in
 * `saveCopyAction`), the Not found form's (`{ manual: { title, author } }`
 * strings with an optional `isbn13` string) or a held Book's (`{ bookId }`, a
 * row id) is `VALIDATION` before `saveEntry()` sees it, and comes back as
 * `VALIDATION`, unlike the copy saves' bad input. The typed text goes
 * as `saveManualAction` sends it. A `{ create }` name is matched to the
 * user's list of that name, or makes one, inside the save's transaction
 * (`resolveWishlist`). `NOT_FOUND` and `RATE_LIMITED` come back as they are,
 * as in `saveCopyAction`; a `VALIDATION` naming `title` or `authors` comes
 * back with only those fields, as in `saveManualAction`. Every other failure
 * but a signed-out session reads as `SAVE_FAILED` (a list gone meanwhile
 * included) and is logged as in `saveCopyAction`.
 */
export async function saveEntryAction(
  input: unknown,
): Promise<ActionResult<Undoable<EntrySaveResult>>> {
  const parsed = parseEntryInput(input)
  const result = await runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (!parsed) throw new DomainError('VALIDATION')
    const { requestId, target, wishlist } = parsed
    return saveEntry(ctx, { requestId, target, save: { kind: 'entry', wishlist } })
  })
  // Bad input stays `VALIDATION`: nothing reached the save, so "try again" would not help.
  if (result.ok || result.code === 'UNAUTHENTICATED' || !parsed) return result
  const marked = manualFields(result)
  if (marked) return marked
  if (result.code !== 'INTERNAL') logger().warn({ code: result.code }, 'saveEntryAction failed')
  return result.code === 'NOT_FOUND' || result.code === 'RATE_LIMITED'
    ? result
    : { ok: false, code: 'SAVE_FAILED' }
}

function parseEntryInput(
  input: unknown,
): { requestId: string; target: SaveTarget; wishlist: Ref } | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const { requestId, wishlist: sent, target } = input as Record<string, unknown>
  const wishlist = parseRef(sent)
  if (typeof requestId !== 'string' || wishlist === undefined) return undefined
  // Every `EntryTarget` kind (`components/entryTarget`), checked in one place.
  const parsed = parseTarget(target, ['isbn13', 'manual', 'bookId'])
  return parsed && { requestId, target: parsed, wishlist }
}
