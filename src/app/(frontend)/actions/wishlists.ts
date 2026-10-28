'use server'

import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { isRowId, type Ref } from '@/lib/payload/ref'
import { setEntryRecipient } from '@/lib/wishlists/entries'
import { createWishlist, deleteWishlist, renameWishlist } from '@/lib/wishlists/wishlists'

import { parseRef } from '../ref'

// The Wishlists section, one wishlist and its opened entry (FR-38, FR-39).
// Client input is checked here, never repaired: a name must be a string, an
// id a row id (`isRowId()`) and a recipient `null` or a `Ref` (`parseRef()`),
// else `VALIDATION` with no write. Normalising, the blank and length checks,
// resolving a Person and ownership are `lib/wishlists`'s. The client
// refreshes or navigates on success; no Undo, no toast.

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
