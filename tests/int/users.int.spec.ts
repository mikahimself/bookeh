import {
  createLocalReq,
  Forbidden,
  getPayload,
  NotFound,
  type RequiredDataFromCollectionSlug,
  ValidationError,
} from 'payload'
import { describe, expect, it } from 'vitest'

import config from '@/payload.config'

import { as, createUser } from '../helpers/harness'

const payload = () => getPayload({ config })

const admin = () => createUser({ roles: ['admin', 'user'] })

const newUser = (tag: string): RequiredDataFromCollectionSlug<'users'> => ({
  email: `${tag}@test.invalid`,
  password: 'test-password',
  displayName: tag,
  roles: ['user'],
  language: 'en',
})

describe('users collection', () => {
  it('lets a user read and update themself', async () => {
    const p = await payload()
    const a = await createUser()

    const read = await p.findByID({ collection: 'users', id: a.id, ...(await as(a)) })
    expect(read.id).toBe(a.id)

    const updated = await p.update({
      collection: 'users',
      id: a.id,
      data: { displayName: 'Renamed', language: 'fi' },
      ...(await as(a)),
    })
    expect(updated.displayName).toBe('Renamed')
    expect(updated.language).toBe('fi')
  })

  it('hides other users from a user', async () => {
    const p = await payload()
    const a = await createUser()
    const b = await createUser()

    await expect(p.findByID({ collection: 'users', id: b.id, ...(await as(a)) })).rejects.toThrow(
      NotFound,
    )

    const found = await p.find({
      collection: 'users',
      where: { id: { in: [a.id, b.id] } },
      ...(await as(a)),
    })
    expect(found.docs.map((d) => d.id)).toEqual([a.id])
  })

  it('rejects a user updating another user', async () => {
    const p = await payload()
    const a = await createUser()
    const b = await createUser({ displayName: 'Original' })

    await expect(
      p.update({
        collection: 'users',
        id: b.id,
        data: { displayName: 'Hijacked' },
        ...(await as(a)),
      }),
    ).rejects.toThrow(Forbidden)

    const after = await p.findByID({ collection: 'users', id: b.id })
    expect(after.displayName).toBe('Original')
  })

  it('silently drops roles a user sets on themself', async () => {
    const p = await payload()
    const a = await createUser()

    const updated = await p.update({
      collection: 'users',
      id: a.id,
      data: { roles: ['admin', 'user'] },
      ...(await as(a)),
    })
    expect(updated.roles).toEqual(['user'])
    const after = await p.findByID({ collection: 'users', id: a.id })
    expect(after.roles).toEqual(['user'])
  })

  it('lets an admin read, update roles, create and delete users', async () => {
    const p = await payload()
    const adm = await admin()
    const b = await createUser()

    const read = await p.findByID({ collection: 'users', id: b.id, ...(await as(adm)) })
    expect(read.id).toBe(b.id)

    const promoted = await p.update({
      collection: 'users',
      id: b.id,
      data: { roles: ['admin', 'user'] },
      ...(await as(adm)),
    })
    expect(promoted.roles).toEqual(['admin', 'user'])

    const created = await p.create({
      collection: 'users',
      data: { ...newUser(`admin-made-${b.id}`), roles: ['admin', 'user'] },
      ...(await as(adm)),
    })
    expect(created.roles).toEqual(['admin', 'user'])
    const deleted = await p.delete({ collection: 'users', id: created.id, ...(await as(adm)) })
    expect(deleted.id).toBe(created.id)
  })

  it('rejects a user creating or deleting users', async () => {
    const p = await payload()
    const a = await createUser()

    await expect(
      p.create({
        collection: 'users',
        data: newUser(`user-made-${a.id}`),
        ...(await as(a)),
      }),
    ).rejects.toThrow(Forbidden)
    await expect(p.delete({ collection: 'users', id: a.id, ...(await as(a)) })).rejects.toThrow(
      Forbidden,
    )
    expect((await p.findByID({ collection: 'users', id: a.id })).id).toBe(a.id)
  })

  it('lets only an admin unlock an account', async () => {
    const p = await payload()
    const a = await createUser()
    const adm = await admin()
    const b = await createUser()
    // Payload's unlock type requires `password`; the operation reads only `email`.
    const data = { email: b.email, password: '' }

    await expect(p.unlock({ collection: 'users', data, ...(await as(a)) })).rejects.toThrow(
      Forbidden,
    )
    await expect(p.unlock({ collection: 'users', data, ...(await as(adm)) })).resolves.toBe(true)
  })

  it('rejects reading users without a signed-in user', async () => {
    const p = await payload()
    const req = await createLocalReq({}, p)

    await expect(
      p.find({ collection: 'users', req, user: null, overrideAccess: false }),
    ).rejects.toThrow(Forbidden)
  })

  it('defaults roles to user and language to en', async () => {
    const p = await payload()
    const adm = await admin()

    const created = await p.create({
      collection: 'users',
      // Payload's create type requires `roles` and `language`; the point is omitting them.
      data: {
        email: `defaults-${adm.id}@test.invalid`,
        password: 'test-password',
        displayName: 'D',
      } as RequiredDataFromCollectionSlug<'users'>,
      ...(await as(adm)),
    })
    expect(created.roles).toEqual(['user'])
    expect(created.language).toBe('en')
  })

  it('rejects an unknown language', async () => {
    const p = await payload()
    const a = await createUser()

    await expect(
      p.update({
        collection: 'users',
        id: a.id,
        // @ts-expect-error -- not one of the options
        data: { language: 'sv' },
        ...(await as(a)),
      }),
    ).rejects.toThrow(ValidationError)
  })

  it('opens /admin to admins only', async () => {
    const p = await payload()
    const canEnter = p.collections.users.config.access.admin
    expect(canEnter).toBeDefined()

    const none = await createLocalReq({}, p)
    const { req: asUser } = await as(await createUser())
    const { req: asAdmin } = await as(await admin())

    expect(await canEnter?.({ req: none })).toBe(false)
    expect(await canEnter?.({ req: asUser })).toBe(false)
    expect(await canEnter?.({ req: asAdmin })).toBe(true)
  })

  it('keeps sessions for 30 days, server-side', async () => {
    const { auth } = (await payload()).collections.users.config
    expect(auth.tokenExpiration).toBe(2592000)
    expect(auth.useSessions).toBe(true)
  })
})
