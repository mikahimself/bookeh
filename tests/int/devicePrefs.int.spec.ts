import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { setDevicePrefsAction } from '@/app/(frontend)/actions/prefs'
import { serializeDevicePrefs } from '@/app/(frontend)/prefs'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { createUser } from '../helpers/harness'

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))

const password = 'prefs-password'
const encode = (value: unknown) => encodeURIComponent(JSON.stringify(value))

let requestHeaders: Headers
let storedPrefs: string | undefined
const cookieStore = {
  get: vi.fn((name: string) =>
    name === 'bookeh_prefs' && storedPrefs !== undefined ? { name, value: storedPrefs } : undefined,
  ),
  set: vi.fn(),
}

describe('setDevicePrefsAction', () => {
  let payload: Payload
  let user: User
  let token: string

  beforeAll(async () => {
    payload = await getPayload({ config })
    user = await createUser({ password })
    const login = await payload.login({
      collection: 'users',
      data: { email: user.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    token = login.token
  })

  beforeEach(() => {
    requestHeaders = new Headers({ cookie: `payload-token=${token}` })
    storedPrefs = undefined
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => cookieStore as never)
  })

  afterEach(() => {
    cookieStore.set.mockClear()
    cookieStore.get.mockClear()
  })

  it('merges the patch over the stored values and writes the whole cookie', async () => {
    storedPrefs = encode({ layout: 'covers', size: 'l', theme: 'light', loans: 'date' })
    const merged = { layout: 'covers', size: 'l', theme: 'dark', loans: 'date' }

    expect(await setDevicePrefsAction({ theme: 'dark' })).toEqual({ ok: true, data: merged })
    expect(cookieStore.set).toHaveBeenCalledOnce()
    expect(cookieStore.set).toHaveBeenCalledWith('bookeh_prefs', encode(merged), {
      path: '/',
      maxAge: 400 * 24 * 60 * 60,
      sameSite: 'lax',
      httpOnly: true,
      // Production-gated (Story 2.2): non-Secure outside production so
      // http://localhost dev keeps working.
      secure: false,
    })
  })

  it('merges over the defaults without a cookie', async () => {
    const result = await setDevicePrefsAction({ loans: 'date' })
    expect(result).toEqual({
      ok: true,
      data: { layout: 'rows', size: 'm', theme: 'system', loans: 'date' },
    })
  })

  it('repairs an unreadable cookie: merges over the defaults and writes all four fields', async () => {
    storedPrefs = 'not json'
    const repaired = { layout: 'rows', size: 'm', theme: 'dark', loans: 'person' } as const

    expect(await setDevicePrefsAction({ theme: 'dark' })).toEqual({ ok: true, data: repaired })
    expect(cookieStore.set).toHaveBeenCalledOnce()
    expect(cookieStore.set.mock.calls[0]?.slice(0, 2)).toEqual([
      'bookeh_prefs',
      serializeDevicePrefs(repaired),
    ])
  })

  it('rewrites the current values for an empty patch, refreshing the expiry', async () => {
    storedPrefs = encode({ layout: 'covers', size: 's', theme: 'dark', loans: 'person' })
    const current = { layout: 'covers', size: 's', theme: 'dark', loans: 'person' }

    expect(await setDevicePrefsAction({})).toEqual({ ok: true, data: current })
    expect(cookieStore.set).toHaveBeenCalledOnce()
    expect(cookieStore.set.mock.calls[0]?.slice(0, 2)).toEqual(['bookeh_prefs', encode(current)])
  })

  it.each<[string, unknown]>([
    ['not an object', 'dark'],
    ['null', null],
    ['an unknown key', { font: 'x' }],
    ['an unknown value', { theme: 'blue' }],
    ['a value of the wrong type', { theme: 1 }],
  ])('answers VALIDATION for %s and writes nothing', async (_, patch) => {
    expect(await setDevicePrefsAction(patch)).toEqual({ ok: false, code: 'VALIDATION' })
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('answers UNAUTHENTICATED without a session and writes nothing', async () => {
    requestHeaders = new Headers()
    expect(await setDevicePrefsAction({ theme: 'dark' })).toEqual({
      ok: false,
      code: 'UNAUTHENTICATED',
    })
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('leaves the user document untouched', async () => {
    const before = await payload.findByID({ collection: 'users', id: user.id })
    expect((await setDevicePrefsAction({ theme: 'dark', layout: 'covers' })).ok).toBe(true)
    const after = await payload.findByID({ collection: 'users', id: user.id })
    expect(after.updatedAt).toBe(before.updatedAt)
    expect(after).toEqual(before)
    expect(cookieStore.set).toHaveBeenCalledOnce()
    expect(cookieStore.set.mock.calls[0]?.[0]).toBe('bookeh_prefs')
  })
})
