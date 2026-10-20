import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { setDefaultLocationAction, updateProfileAction } from '@/app/(frontend)/actions/account'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'

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
      data: {
        email: user.email,
        displayName: 'Mäki',
        language: 'en',
        profileVisibility: 'hidden',
        collectionVisibility: 'closed',
        defaultLocation: null,
      },
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
      data: {
        email: user.email,
        displayName: 'Before',
        language: 'fi',
        profileVisibility: 'hidden',
        collectionVisibility: 'closed',
        defaultLocation: null,
      },
    })
    expect((await stored()).language).toBe('fi')
  })

  it.each([
    ['profileVisibility', 'public'],
    ['collectionVisibility', 'open'],
  ] as const)('persists %s %s', async (field, value) => {
    const result = await updateProfileAction({ [field]: value })
    expect(result).toEqual({
      ok: true,
      data: {
        email: user.email,
        displayName: 'Before',
        language: 'en',
        profileVisibility: 'hidden',
        collectionVisibility: 'closed',
        defaultLocation: null,
        [field]: value,
      },
    })
    expect((await stored())[field]).toBe(value)
  })

  it('saves a mixed change in one write and answers both new values', async () => {
    const result = await updateProfileAction({ displayName: 'Mika', collectionVisibility: 'open' })
    expect(result).toEqual({
      ok: true,
      data: {
        email: user.email,
        displayName: 'Mika',
        language: 'en',
        profileVisibility: 'hidden',
        collectionVisibility: 'open',
        defaultLocation: null,
      },
    })
    const row = await stored()
    expect(row.displayName).toBe('Mika')
    expect(row.collectionVisibility).toBe('open')
  })

  it.each<[string, unknown]>([
    ['a string', 'x'],
    ['null', null],
    ['an unknown key', { id: 1 }],
    ['an unknown language', { language: 'sv' }],
    ['a display name of the wrong type', { displayName: 1 }],
    ['a valid key beside roles', { displayName: 'A', roles: ['admin'] }],
    ['an unknown profile visibility', { profileVisibility: 'x' }],
    ['a collection visibility of the wrong type', { collectionVisibility: true }],
    ['a profile visibility from the wrong tuple', { profileVisibility: 'open' }],
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
      data: {
        email: user.email,
        displayName: 'Before',
        language: 'en',
        profileVisibility: 'hidden',
        collectionVisibility: 'closed',
        defaultLocation: null,
      },
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

describe('setDefaultLocationAction', () => {
  let payload: Payload
  let user: User
  let koti: number
  let mokki: number

  /** The stored row, read past access control. */
  const stored = () => payload.findByID({ collection: 'users', id: user.id, depth: 0 })

  /** A location of `owner`; `owner` and `nameKey` only satisfy the create type. */
  const locationOf = async (owner: User, name: string) =>
    (
      await gateway.create(await contextFor(owner), {
        collection: 'locations',
        data: { owner: owner.id, name, nameKey: '' },
        depth: 0,
      })
    ).id

  /** The user's locations, read past access control. */
  const ownLocations = async () =>
    (
      await payload.find({
        collection: 'locations',
        where: { owner: { equals: user.id } },
        sort: 'name',
        pagination: false,
        depth: 0,
      })
    ).docs.map(({ id, name }) => ({ id, name }))

  const signIn = async (signed: User) => {
    const login = await payload.login({
      collection: 'users',
      data: { email: signed.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    requestHeaders = new Headers({ cookie: `payload-token=${login.token}` })
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => ({ get: () => undefined }) as never)
  })

  beforeEach(async () => {
    user = await createUser({ password })
    // Created out of order: the answer lists them by name.
    mokki = await locationOf(user, 'Mökki')
    koti = await locationOf(user, 'Koti')
    await signIn(user)
  })

  it('stores a picked location and answers it with the locations by name', async () => {
    expect(await setDefaultLocationAction(mokki)).toEqual({
      ok: true,
      data: {
        defaultLocation: mokki,
        locations: [
          { id: koti, name: 'Koti' },
          { id: mokki, name: 'Mökki' },
        ],
      },
    })
    expect((await stored()).defaultLocation).toBe(mokki)
  })

  it('creates a location by its normalised name, stores it and lists it in name order', async () => {
    const result = await setDefaultLocationAction({ create: ' Työ ' })
    const locations = await ownLocations()
    const tyo = locations.find(({ name }) => name === 'Työ')
    expect(tyo).toBeDefined()
    expect(result).toEqual({
      ok: true,
      data: {
        defaultLocation: tyo?.id,
        locations: [
          { id: koti, name: 'Koti' },
          { id: mokki, name: 'Mökki' },
          { id: tyo?.id, name: 'Työ' },
        ],
      },
    })
    expect((await stored()).defaultLocation).toBe(tyo?.id)
  })

  it('stores the existing location for a name that matches one, without a new row', async () => {
    const result = await setDefaultLocationAction({ create: 'koti' })
    expect(result).toMatchObject({ ok: true, data: { defaultLocation: koti } })
    expect(await ownLocations()).toHaveLength(2)
    expect((await stored()).defaultLocation).toBe(koti)
  })

  it('creates and stores the first location of a user who has none', async () => {
    user = await createUser({ password })
    await signIn(user)
    const result = await setDefaultLocationAction({ create: 'Koti' })
    const [created] = await ownLocations()
    expect(result).toEqual({
      ok: true,
      data: { defaultLocation: created?.id, locations: [{ id: created?.id, name: 'Koti' }] },
    })
    expect((await stored()).defaultLocation).toBe(created?.id)
  })

  it('clears the default for null', async () => {
    await setDefaultLocationAction(koti)
    expect(await setDefaultLocationAction(null)).toMatchObject({
      ok: true,
      data: { defaultLocation: null },
    })
    expect((await stored()).defaultLocation).toBeNull()
  })

  it('answers VALIDATION on defaultLocation for another user’s location and keeps the default', async () => {
    await setDefaultLocationAction(koti)
    const foreign = await locationOf(await createUser(), 'Vieras')
    expect(await setDefaultLocationAction(foreign)).toEqual({
      ok: false,
      code: 'VALIDATION',
      fields: { defaultLocation: 'VALIDATION' },
    })
    expect((await stored()).defaultLocation).toBe(koti)
  })

  it('answers VALIDATION on location for a blank name and writes nothing', async () => {
    const before = await stored()
    expect(await setDefaultLocationAction({ create: '   ' })).toEqual({
      ok: false,
      code: 'VALIDATION',
      fields: { location: 'VALIDATION' },
    })
    expect(await stored()).toEqual(before)
    expect(await ownLocations()).toHaveLength(2)
  })

  it.each<[string, unknown]>([
    ['a numeric string', '2'],
    ['a non-string name', { create: 1 }],
    ['a name beside an id', { create: 'A', id: 1 }],
    ['zero', 0],
    ['a fraction', 1.5],
  ])('answers VALIDATION for %s and writes nothing', async (_, value) => {
    const before = await stored()
    expect(await setDefaultLocationAction(value)).toEqual({ ok: false, code: 'VALIDATION' })
    expect(await stored()).toEqual(before)
    expect(await ownLocations()).toHaveLength(2)
  })

  it('answers UNAUTHENTICATED without a session and writes nothing', async () => {
    requestHeaders = new Headers()
    const before = await stored()
    expect(await setDefaultLocationAction(koti)).toEqual({ ok: false, code: 'UNAUTHENTICATED' })
    expect(await stored()).toEqual(before)
  })
})
