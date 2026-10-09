import { cookies } from 'next/headers'

import { encodeFlash, FLASH_COOKIE } from './flashCookie'
import type { ToastInput } from './store'

/**
 * Spine, Toasts: raises a toast from server code by setting the
 * `bookeh_flash` cookie. Call it from a server action or route handler
 * (server components cannot set cookies). The provider reads and clears the
 * cookie on mount and on pathname change, so set it only in a flow that
 * lands on a path — before a redirect, say; a same-path action or a
 * query-only navigation does not surface it. Not HttpOnly on purpose: the
 * client must read and clear it.
 */
export async function flashToast(input: ToastInput): Promise<void> {
  ;(await cookies()).set(FLASH_COOKIE, encodeFlash(input), {
    path: '/',
    maxAge: 60,
    sameSite: 'lax',
    httpOnly: false,
  })
}
