import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createLocalReq, getPayload, type PayloadRequest, type TypedUser } from 'payload'

import { DomainError } from '@/lib/errors'
import config from '@/payload.config'

import { PATH_HEADER } from './pathHeader'

/**
 * Spine, AD-16: the signed-in user and the request every gateway call runs
 * in. `req.user` is `user`. Never kept beyond its request.
 */
export type Context = { req: PayloadRequest; user: TypedUser }

/** The session of the current request, through Payload's own auth strategies. */
async function currentContext(): Promise<Context | null> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return null
  const req = await createLocalReq({ user }, payload)
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
