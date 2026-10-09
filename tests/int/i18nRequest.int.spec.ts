import { createFormatter } from 'next-intl'
import { getPayload } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import requestConfig from '@/i18n/request'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { createUser } from '../helpers/harness'

const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: { current: new Headers() } }))
vi.mock('next/headers', () => ({ headers: async () => requestHeaders.current }))
// Outside the react-server condition `next-intl/server` resolves to client
// stubs that throw. The real `getRequestConfig` is an identity wrapper.
vi.mock('next-intl/server', () => ({ getRequestConfig: <T>(fn: T): T => fn }))

const password = 'test-password'

async function tokenFor(user: User): Promise<string> {
  const payload = await getPayload({ config })
  const { token } = await payload.login({
    collection: 'users',
    data: { email: user.email, password },
  })
  if (!token) throw new Error('login returned no token')
  return token
}

async function resolve(init: Record<string, string>) {
  requestHeaders.current = new Headers(init)
  // `getRequestConfig` is mocked to identity; next-intl passes `requestLocale`.
  return requestConfig({ requestLocale: Promise.resolve(undefined) })
}

beforeEach(() => {
  requestHeaders.current = new Headers()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('i18n request config', () => {
  it("uses a fi user's language over an English browser", async () => {
    const token = await tokenFor(await createUser({ language: 'fi' }))
    const result = await resolve({ cookie: `payload-token=${token}`, 'accept-language': 'en' })
    expect(result.locale).toBe('fi')
    expect(result.messages).toMatchObject({
      errors: { INTERNAL: 'Ei onnistunut. Yritä uudelleen.' },
    })
  })

  it("uses an en user's language over a Finnish browser", async () => {
    const token = await tokenFor(await createUser({ language: 'en' }))
    const result = await resolve({ cookie: `payload-token=${token}`, 'accept-language': 'fi-FI' })
    expect(result.locale).toBe('en')
    expect(result.messages).toMatchObject({ errors: { INTERNAL: "Didn't work. Try again." } })
  })

  it('treats an invalid token as anonymous', async () => {
    // Payload's JWT strategy returns `user: null` for an invalid token; it does not throw.
    const result = await resolve({ cookie: 'payload-token=garbage', 'accept-language': 'fi-FI' })
    expect(result.locale).toBe('fi')
  })

  it('lets a failing session read throw, as requireUser() would on the same page', async () => {
    const payload = await getPayload({ config })
    vi.spyOn(payload, 'auth').mockRejectedValueOnce(new Error('auth strategy failed'))

    await expect(resolve({ 'accept-language': 'fi-FI' })).rejects.toThrow('auth strategy failed')
  })

  it('sets the Helsinki time zone and formats in the locale', async () => {
    const token = await tokenFor(await createUser({ language: 'fi' }))
    const result = await resolve({ cookie: `payload-token=${token}` })
    expect(result.timeZone).toBe('Europe/Helsinki')

    const format = createFormatter({ locale: result.locale!, timeZone: result.timeZone })
    // 21:30 UTC on 4 October is 00:30 on 5 October in Helsinki (UTC+3); fi puts the day first.
    expect(
      format.dateTime(new Date('2026-10-04T21:30:00Z'), {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }),
    ).toBe('5.10.2026')
    expect(format.number(1234.5)).toBe('1\u00a0234,5')
  })
})
