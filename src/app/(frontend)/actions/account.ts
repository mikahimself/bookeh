'use server'

import { updateProfile, type Profile } from '@/lib/account/profile'
import { signOut } from '@/lib/account/session'
import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'

import { parseProfileChanges } from '../profileChanges'

/** Ends the current session. The client goes to `/login`; the action never redirects. */
export async function signOutAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    await signOut(await requireUserOrThrow())
    return null
  })
}

/**
 * Changes the signed-in user's display name and/or language (FR-4, FR-51).
 * The changes come from the client, so anything outside the two known keys
 * is `VALIDATION` with no write. Never redirects or refreshes: after a
 * language change the client calls `router.refresh()`, a new request, so the
 * cached session user never spans the change.
 */
export async function updateProfileAction(changes: unknown): Promise<ActionResult<Profile>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const parsed = parseProfileChanges(changes)
    if (parsed === null) throw new DomainError('VALIDATION')
    return updateProfile(ctx, parsed)
  })
}
