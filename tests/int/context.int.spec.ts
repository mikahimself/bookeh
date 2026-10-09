import { headers } from 'next/headers'
import { getPayload, jwtSign } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DomainError } from '@/lib/errors'
import { requireUser, requireUserOrThrow } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { PATH_HEADER } from '@/lib/payload/pathHeader'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { createUser } from '../helpers/harness'

vi.mock('next/headers', () => ({ headers: vi.fn() }))

const password = 'context-password'

let requestHeaders: Headers
const request = (init: Record<string, string>) => {
  requestHeaders = new Headers(init)
}

/** The target of a Next.js redirect error: `NEXT_REDIRECT;<type>;<url>;<status>;`. */
async function redirectTarget(promise: Promise<unknown>): Promise<string> {
  const err: unknown = await promise.then(
    () => expect.fail('expected a redirect'),
    (e: unknown) => e,
  )
  const digest = (err as { digest?: unknown }).digest
  expect(typeof digest).toBe('string')
  const [kind, , url] = (digest as string).split(';')
  expect(kind).toBe('NEXT_REDIRECT')
  return url
}

describe('request context', () => {
  let user: User
  let token: string
  let expired: string

  beforeAll(async () => {
    const payload = await getPayload({ config })
    user = await createUser({ password })
    const login = await payload.login({
      collection: 'users',
      data: { email: user.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    token = login.token
    // The same claims, signed with an expiry in the past.
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<
      string,
      unknown
    >
    delete claims.iat
    delete claims.exp
    expired = (
      await jwtSign({ fieldsToSign: claims, secret: payload.secret, tokenExpiration: -60 })
    ).token
  })

  beforeEach(() => {
    requestHeaders = new Headers()
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
  })

  describe('requireUser', () => {
    it('returns the signed-in user and a request acting as them', async () => {
      request({ cookie: `payload-token=${token}`, [PATH_HEADER]: '/settings' })
      const ctx = await requireUser()
      expect(ctx.user.id).toBe(user.id)
      expect(ctx.req.user?.id).toBe(user.id)
    })

    it.each([
      ['no cookie', undefined],
      ['a garbage cookie', 'payload-token=not-a-jwt'],
      ['an expired cookie', 'expired'],
    ])('redirects to /login?next=<path> with %s', async (_, cookie) => {
      const init: Record<string, string> = { [PATH_HEADER]: '/settings?a=1' }
      if (cookie) init.cookie = cookie === 'expired' ? `payload-token=${expired}` : cookie
      request(init)
      expect(await redirectTarget(requireUser())).toBe('/login?next=%2Fsettings%3Fa%3D1')
    })

    it('redirects to /login without a path header', async () => {
      request({})
      expect(await redirectTarget(requireUser())).toBe('/login')
    })
  })

  describe('requireUserOrThrow', () => {
    it('returns the signed-in user', async () => {
      request({ cookie: `payload-token=${token}` })
      const ctx = await requireUserOrThrow()
      expect(ctx.user.id).toBe(user.id)
      expect(ctx.req.user?.id).toBe(user.id)
    })

    it('gives the gateway a context scoped to the session user', async () => {
      request({ cookie: `payload-token=${token}` })
      const ctx = await requireUserOrThrow()
      const found = await gateway.find(ctx, { collection: 'users' })
      expect(found.docs.map((d) => d.id)).toEqual([user.id])
    })

    it('throws UNAUTHENTICATED without a session', async () => {
      request({ [PATH_HEADER]: '/settings' })
      const err: unknown = await requireUserOrThrow().catch((e: unknown) => e)
      expect(err).toBeInstanceOf(DomainError)
      expect((err as DomainError).code).toBe('UNAUTHENTICATED')
    })
  })
})
