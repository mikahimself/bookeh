'use server'

import { signIn } from '@/lib/account/session'
import { runAction, type ActionResult } from '@/lib/errors'

import { safeNextPath } from './nextPath'

/**
 * Spine, AD-2: the one action without `requireUserOrThrow()`. Answers where
 * to go next; the client navigates, the action never redirects.
 */
export async function signInAction(formData: FormData): Promise<ActionResult<{ to: string }>> {
  return runAction(async () => {
    const email = formData.get('email')
    const password = formData.get('password')
    await signIn(
      typeof email === 'string' ? email.trim().normalize('NFC') : '',
      typeof password === 'string' ? password : '',
    )
    return { to: safeNextPath(formData.get('next')) }
  })
}
