import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { signOutAction } from '@/app/(frontend)/actions/account'
import { signInAction } from '@/app/(frontend)/login/actions'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { createUser } from '../helpers/harness'

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))

const password = 'session-password'
const thirtyDays = 30 * 24 * 60 * 60 * 1000

let requestHeaders: Headers
const cookieStore = { set: vi.fn(), delete: vi.fn() }

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

/** The token the last successful sign-in put in the cookie. */
const setToken = (): string => {
  expect(cookieStore.set).toHaveBeenCalledOnce()
  const [name, value] = cookieStore.set.mock.calls[0] as [string, string]
  expect(name).toBe('payload-token')
  return value
}

const authenticates = async (payload: Payload, token: string) =>
  (await payload.auth({ headers: new Headers({ cookie: `payload-token=${token}` }) })).user

describe('sign in and sign out', () => {
  let payload: Payload
  let user: User

  beforeAll(async () => {
    payload = await getPayload({ config })
    user = await createUser({ password })
  })

  beforeEach(() => {
    requestHeaders = new Headers()
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => cookieStore as never)
  })

  afterEach(() => {
    cookieStore.set.mockReset()
    cookieStore.delete.mockReset()
    vi.restoreAllMocks()
  })

  describe('signInAction', () => {
    it('signs in with differing case and spaces, sets the session cookie and returns next', async () => {
      const before = Date.now()
      const result = await signInAction(
        form({ email: `  ${user.email.toUpperCase()} `, password, next: '/loans?x=1' }),
      )
      expect(result).toEqual({ ok: true, data: { to: '/loans?x=1' } })

      const token = setToken()
      const [, , options] = cookieStore.set.mock.calls[0] as [
        string,
        string,
        { httpOnly: boolean; path: string; sameSite: string; expires: Date },
      ]
      expect(options).toMatchObject({ httpOnly: true, path: '/', sameSite: 'lax' })
      expect(options.expires.getTime()).toBeGreaterThanOrEqual(before + thirtyDays - 1000)
      expect(options.expires.getTime()).toBeLessThanOrEqual(Date.now() + thirtyDays + 1000)
      expect((await authenticates(payload, token))?.id).toBe(user.id)
    })

    it.each([
      ['a wrong password', () => user.email, 'not-the-password'],
      ['an unknown email', () => 'nobody@test.invalid', password],
    ])('answers WRONG_CREDENTIALS for %s, with no cookie', async (_, email, pw) => {
      const result = await signInAction(form({ email: email(), password: pw }))
      expect(result).toEqual({ ok: false, code: 'WRONG_CREDENTIALS' })
      expect(cookieStore.set).not.toHaveBeenCalled()
    })

    it.each([
      ['a blank email', '', password],
      ['a whitespace email', '   ', password],
      ['a blank password', 'x@test.invalid', ''],
      ['a whitespace password', 'x@test.invalid', '  '],
    ])('answers WRONG_CREDENTIALS for %s without calling Payload', async (_, email, pw) => {
      const login = vi.spyOn(payload, 'login')
      const result = await signInAction(form({ email, password: pw }))
      expect(result).toEqual({ ok: false, code: 'WRONG_CREDENTIALS' })
      expect(login).not.toHaveBeenCalled()
      expect(cookieStore.set).not.toHaveBeenCalled()
    })

    it('answers WRONG_CREDENTIALS for missing fields', async () => {
      expect(await signInAction(new FormData())).toEqual({ ok: false, code: 'WRONG_CREDENTIALS' })
    })

    it('answers WRONG_CREDENTIALS for a locked account, even with the right password', async () => {
      const locked = await createUser({ password })
      for (let i = 0; i < 5; i++) {
        expect(await signInAction(form({ email: locked.email, password: 'wrong' }))).toEqual({
          ok: false,
          code: 'WRONG_CREDENTIALS',
        })
      }
      const result = await signInAction(form({ email: locked.email, password }))
      expect(result).toEqual({ ok: false, code: 'WRONG_CREDENTIALS' })
      expect(cookieStore.set).not.toHaveBeenCalled()
    })

    it.each([
      ['missing', undefined],
      ['an absolute URL', 'https://evil.example/'],
      ['protocol-relative', '//evil.example'],
      ['/login', '/login?next=/x'],
    ])('returns / for an unsafe next (%s)', async (_, next) => {
      const fields: Record<string, string> = { email: user.email, password }
      if (next !== undefined) fields.next = next
      expect(await signInAction(form(fields))).toEqual({ ok: true, data: { to: '/' } })
    })
  })

  describe('signOutAction', () => {
    it('ends the session: deletes the cookie and the old token stops authenticating', async () => {
      await signInAction(form({ email: user.email, password }))
      const token = setToken()
      requestHeaders = new Headers({ cookie: `payload-token=${token}` })

      expect(await signOutAction()).toEqual({ ok: true, data: null })
      expect(cookieStore.delete).toHaveBeenCalledWith('payload-token')
      expect(await authenticates(payload, token)).toBeNull()

      // The dead cookie no longer signs anyone out.
      cookieStore.delete.mockReset()
      expect(await signOutAction()).toEqual({ ok: false, code: 'UNAUTHENTICATED' })
      expect(cookieStore.delete).not.toHaveBeenCalled()
    })

    it('keeps other sessions of the same user', async () => {
      await signInAction(form({ email: user.email, password }))
      const kept = setToken()
      cookieStore.set.mockReset()
      await signInAction(form({ email: user.email, password }))
      const ended = setToken()

      requestHeaders = new Headers({ cookie: `payload-token=${ended}` })
      expect(await signOutAction()).toEqual({ ok: true, data: null })
      expect((await authenticates(payload, kept))?.id).toBe(user.id)
    })

    it('answers UNAUTHENTICATED without a session', async () => {
      expect(await signOutAction()).toEqual({ ok: false, code: 'UNAUTHENTICATED' })
      expect(cookieStore.delete).not.toHaveBeenCalled()
    })
  })
})
