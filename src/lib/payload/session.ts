import { cookies } from 'next/headers'
import { AuthenticationError, getPayload, LockedAuth, logoutOperation } from 'payload'
import { generatePayloadCookie } from 'payload/shared'

import config from '@/payload.config'

import type { Context } from './context'

const sameSites = { Lax: 'lax', Strict: 'strict', None: 'none' } as const

/**
 * Spine, AD-2: the sign-in exception, run without a context. Signs in through
 * Payload's local strategy and sets Payload's own session cookie, named and
 * shaped by the `users` auth config. Returns `false` for wrong credentials
 * and for a locked account (Payload throws `LockedAuth` only for a real one);
 * other errors propagate.
 */
export async function startSession(email: string, password: string): Promise<boolean> {
  const payload = await getPayload({ config })
  const login = await payload
    .login({ collection: 'users', data: { email, password } })
    .catch((err: unknown) => {
      if (err instanceof AuthenticationError || err instanceof LockedAuth) return null
      throw err
    })
  if (!login) return false
  const { exp, token } = login
  if (!token || !exp) throw new Error('Payload login returned no token')

  const cookie = generatePayloadCookie({
    collectionAuthConfig: payload.collections.users.config.auth,
    cookiePrefix: payload.config.cookiePrefix,
    returnCookieAsObject: true,
    token,
  })
  ;(await cookies()).set(cookie.name, token, {
    httpOnly: cookie.httpOnly,
    path: cookie.path,
    sameSite: cookie.sameSite && sameSites[cookie.sameSite],
    secure: cookie.secure,
    domain: cookie.domain,
    // The token's own expiry (`tokenExpiration`). Payload's cookie expiry adds
    // wall-clock seconds in local time, an hour off across a DST change.
    expires: new Date(exp * 1000),
  })
  return true
}

/**
 * Ends the context's session: removes its session row (`req.user._sid`), so
 * the token stops authenticating, then deletes the cookie.
 */
export async function endSession(ctx: Context): Promise<void> {
  const { payload } = ctx.req
  await logoutOperation({ collection: payload.collections.users, req: ctx.req })
  ;(await cookies()).delete(`${payload.config.cookiePrefix}-token`)
}
