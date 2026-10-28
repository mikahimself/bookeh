'use server'

import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { isRowId } from '@/lib/payload/ref'
import { createWishlist, deleteWishlist, renameWishlist } from '@/lib/wishlists/wishlists'

// The Wishlists section and one wishlist (FR-38, FR-39). Client input is
// checked here, never repaired: a name must be a string and an id a row id
// (`isRowId()`), else `VALIDATION` with no write. Normalising, the blank and
// length checks and ownership are `lib/wishlists`'s. The client refreshes or
// navigates on success; no Undo, no toast.

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
