import { getPayload } from 'payload'
import { beforeEach, describe, expect, it } from 'vitest'

import { getProfile, updateProfile, type ProfileChanges } from '@/lib/account/profile'
import { DomainError, runAction } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'

/** The stored row, read past access control. */
const stored = async (id: number): Promise<User> =>
  (await getPayload({ config })).findByID({ collection: 'users', id })

/** Changes a caller gets past the compiler. */
const smuggle = (changes: Record<string, unknown>): ProfileChanges => changes as ProfileChanges

describe('profile service', () => {
  let a: User
  let b: User
  let ctx: Context

  beforeEach(async () => {
    a = await createUser({ displayName: 'Profile A', language: 'en' })
    b = await createUser({ displayName: 'Profile B' })
    ctx = await contextFor(a)
  })

  it('reads the context user’s email, display name and language only', async () => {
    const profile = await getProfile(ctx)
    expect(profile).toStrictEqual({ email: a.email, displayName: 'Profile A', language: 'en' })
  })

  it('trims and NFC-normalises the display name', async () => {
    const profile = await updateProfile(ctx, { displayName: '  Mäki ' })
    expect(profile.displayName).toBe('Mäki')
    expect((await stored(a.id)).displayName).toBe('Mäki')
  })

  it.each(['   ', ''])('rejects the blank display name %j', async (displayName) => {
    const error = await updateProfile(ctx, { displayName }).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ code: 'VALIDATION', fields: { displayName: 'VALIDATION' } })
    const row = await stored(a.id)
    expect(row.displayName).toBe('Profile A')
    expect(row.updatedAt).toBe(a.updatedAt)
  })

  it('changes the language and leaves the display name', async () => {
    const profile = await updateProfile(ctx, { language: 'fi' })
    expect(profile).toStrictEqual({ email: a.email, displayName: 'Profile A', language: 'fi' })
    const row = await stored(a.id)
    expect(row.language).toBe('fi')
    expect(row.displayName).toBe('Profile A')
  })

  it('leaves an unknown language to Payload’s validation', async () => {
    const result = await runAction(() => updateProfile(ctx, smuggle({ language: 'sv' })))
    expect(result).toStrictEqual({
      ok: false,
      code: 'VALIDATION',
      fields: { language: 'VALIDATION' },
    })
    expect((await stored(a.id)).language).toBe('en')
  })

  it('returns the current profile and writes nothing when nothing changes', async () => {
    const profile = await updateProfile(ctx, { displayName: undefined })
    expect(profile).toStrictEqual({ email: a.email, displayName: 'Profile A', language: 'en' })
    expect(await updateProfile(ctx, {})).toStrictEqual(profile)
    expect((await stored(a.id)).updatedAt).toBe(a.updatedAt)
  })

  it('writes only the display name and language of a user', async () => {
    await updateProfile(
      ctx,
      smuggle({ displayName: 'A2', id: b.id, roles: ['admin'], email: 'x@test.invalid' }),
    )
    const own = await stored(a.id)
    expect(own.displayName).toBe('A2')
    expect(own.roles).toEqual(['user'])
    expect(own.email).toBe(a.email)
    expect(await stored(b.id)).toStrictEqual(b)
  })

  it('writes only the display name and language of an admin', async () => {
    const admin = await createUser({ displayName: 'Admin', roles: ['admin', 'user'] })
    await updateProfile(
      await contextFor(admin),
      smuggle({ displayName: 'Ad2', id: b.id, roles: ['user'] }),
    )
    const own = await stored(admin.id)
    expect(own.displayName).toBe('Ad2')
    expect(own.roles).toEqual(['admin', 'user'])
    expect(await stored(b.id)).toStrictEqual(b)
  })
})
