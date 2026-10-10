import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { updateProfileAction } from '@/app/(frontend)/actions/account'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { createUser } from '../helpers/harness'

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))

const password = 'profile-action-password'

let requestHeaders: Headers

describe('updateProfileAction', () => {
  let payload: Payload
  let user: User

  /** The stored row, read past access control. */
  const stored = () => payload.findByID({ collection: 'users', id: user.id })

  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => ({ get: () => undefined }) as never)
  })

  beforeEach(async () => {
    user = await createUser({ password, displayName: 'Before', language: 'en' })
    const login = await payload.login({
      collection: 'users',
      data: { email: user.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    requestHeaders = new Headers({ cookie: `payload-token=${login.token}` })
  })

  it('saves the display name trimmed and NFC-normalised, and answers the profile', async () => {
    const result = await updateProfileAction({ displayName: '  Mäki ' })
    expect(result).toEqual({
      ok: true,
      data: { email: user.email, displayName: 'Mäki', language: 'en' },
    })
    expect((await stored()).displayName).toBe('Mäki')
  })

  it('answers VALIDATION on displayName for a blank name and writes nothing', async () => {
    const before = await stored()
    expect(await updateProfileAction({ displayName: '   ' })).toEqual({
      ok: false,
      code: 'VALIDATION',
      fields: { displayName: 'VALIDATION' },
    })
    expect(await stored()).toEqual(before)
  })

  it('persists the language', async () => {
    const result = await updateProfileAction({ language: 'fi' })
    expect(result).toEqual({
      ok: true,
      data: { email: user.email, displayName: 'Before', language: 'fi' },
    })
    expect((await stored()).language).toBe('fi')
  })

  it.each<[string, unknown]>([
    ['a string', 'x'],
    ['null', null],
    ['an unknown key', { id: 1 }],
    ['an unknown language', { language: 'sv' }],
    ['a display name of the wrong type', { displayName: 1 }],
    ['a valid key beside roles', { displayName: 'A', roles: ['admin'] }],
  ])('answers VALIDATION for %s and leaves the row unchanged', async (_, changes) => {
    const before = await stored()
    expect(await updateProfileAction(changes)).toEqual({ ok: false, code: 'VALIDATION' })
    const after = await stored()
    expect(after.updatedAt).toBe(before.updatedAt)
    expect(after).toEqual(before)
  })

  it('answers the current profile for empty changes, without a write', async () => {
    const before = await stored()
    expect(await updateProfileAction({})).toEqual({
      ok: true,
      data: { email: user.email, displayName: 'Before', language: 'en' },
    })
    expect((await stored()).updatedAt).toBe(before.updatedAt)
  })

  it('answers UNAUTHENTICATED without a session and writes nothing', async () => {
    requestHeaders = new Headers()
    const before = await stored()
    expect(await updateProfileAction({ displayName: 'Nobody' })).toEqual({
      ok: false,
      code: 'UNAUTHENTICATED',
    })
    expect(await stored()).toEqual(before)
  })
})
