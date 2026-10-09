import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createLocalReq, getPayload, type PayloadRequest, type TypedUser } from 'payload'
import { cache } from 'react'

import { DomainError } from '@/lib/errors'
import config from '@/payload.config'

import { PATH_HEADER } from './pathHeader'

/**
 * Spine, AD-16: the signed-in user and the request every gateway call runs
 * in. `req.user` is `user`. Never kept beyond its request.
 */
export type Context = { req: PayloadRequest; user: TypedUser }

/**
 * The signed-in user of the current request, or `null`, through Payload's own
 * auth strategies. For code that renders with or without a session (the
 * locale in `src/i18n/request.ts`); pages use `requireUser()`. Cached per
 * render, so the layout and the page authenticate once.
 */
export const currentUser = cache(async (): Promise<TypedUser | null> => {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  return user
})

async function currentContext(): Promise<Context | null> {
  const user = await currentUser()
  if (!user) return null
  const req = await createLocalReq({ user }, await getPayload({ config }))
  return { req, user }
}

/**
 * Spine, AD-2 and AD-16: the first call of every page. Returns the context of
 * the signed-in user, or redirects to `/login?next=<path>`, the path and
 * search `src/proxy.ts` forwarded; to `/login` without one.
 */
export async function requireUser(): Promise<Context> {
  const ctx = await currentContext()
  if (ctx) return ctx
  const path = (await headers()).get(PATH_HEADER)
  redirect(path ? `/login?next=${encodeURIComponent(path)}` : '/login')
}

/**
 * Spine, AD-2 and AD-16: the first call of every server action and route
 * handler, inside `runAction()` or `runRoute()`. Throws
 * `DomainError('UNAUTHENTICATED')` instead of redirecting.
 */
export async function requireUserOrThrow(): Promise<Context> {
  const ctx = await currentContext()
  if (ctx) return ctx
  throw new DomainError('UNAUTHENTICATED')
}
