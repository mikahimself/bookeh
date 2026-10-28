'use server'

import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { createWishlist } from '@/lib/wishlists/wishlists'

// The Wishlists section (FR-38, FR-39). Client input is checked here, never
// repaired: a name must be a string, else `VALIDATION` with no write.
// Normalising, the blank and length checks and ownership are
// `lib/wishlists`'s. The client calls `router.refresh()` on success; no Undo.

/** "New list": adds a wishlist; a name in use fails `NAME_TAKEN` with its id as `conflictId`. */
export async function createWishlistAction(name: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (typeof name !== 'string') throw new DomainError('VALIDATION')
    await createWishlist(ctx, name)
    return null
  })
}
