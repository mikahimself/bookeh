'use server'

import { signOut } from '@/lib/account/session'
import { runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'

/** Ends the current session. The client goes to `/login`; the action never redirects. */
export async function signOutAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    await signOut(await requireUserOrThrow())
    return null
  })
}
