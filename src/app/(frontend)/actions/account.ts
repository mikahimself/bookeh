'use server'

import { updateProfile, type Profile } from '@/lib/account/profile'
import { signOut } from '@/lib/account/session'
import { listLocations, resolveLocation, type LocationOption } from '@/lib/copies/locations'
import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'

import { parseProfileChanges } from '../profileChanges'
import { parseRef } from '../ref'

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

/** What `setDefaultLocationAction` answers: the stored default and the fresh list. */
export type DefaultLocationAnswer = { defaultLocation: number | null; locations: LocationOption[] }

/**
 * Sets the signed-in user's default location (FR-4, UX-DR50): `null` clears
 * it, a `Ref` picks or creates one. Anything else is `VALIDATION` with no
 * read or write. The `Ref` resolves through `lib/copies` first, then the id
 * is written through `lib/account`: two calls, no shared transaction, so a
 * location created by name stays if the profile write fails (spine: Undo
 * leaves a row created inline). A foreign id fails `ownedRelation` as
 * `VALIDATION` on `defaultLocation`. Answers the stored value and the fresh
 * list, so the client marks a created location without a refresh.
 */
export async function setDefaultLocationAction(
  value: unknown,
): Promise<ActionResult<DefaultLocationAnswer>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const ref = value === null ? null : parseRef(value)
    if (ref === undefined) throw new DomainError('VALIDATION')
    const id = ref === null ? null : await resolveLocation(ctx, ref)
    const { defaultLocation } = await updateProfile(ctx, { defaultLocation: id })
    return { defaultLocation, locations: await listLocations(ctx) }
  })
}
