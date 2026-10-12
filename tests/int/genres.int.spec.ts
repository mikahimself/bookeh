import { randomUUID } from 'node:crypto'

import { createLocalReq, Forbidden, getPayload, type Payload, ValidationError } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { runAction } from '@/lib/errors'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'

// `genres`, AD-4/AD-5/AD-19: shared system genres read by everyone signed in
// and written by the admin only; `nameKey` unique across the table. The index
// is global and rows are never cleaned up, so names carry a per-run suffix.

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

describe('genres', () => {
  let payload: Payload
  let user: User
  let admin: User

  /** A system write, as `lib/catalogue` makes it. */
  const systemCreate = (name: string) =>
    payload.create({
      collection: 'genres',
      data: { name, nameKey: '' },
      overrideAccess: true,
      depth: 0,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
    user = await createUser({ displayName: 'Genre User' })
    admin = await createUser({ displayName: 'Genre Admin', roles: ['admin'] })
  })

  it('lets a signed-in user read genres', async () => {
    const genre = await systemCreate(unique('Read Genre'))
    const ctx = await contextFor(user)
    const found = await gateway.find(ctx, {
      collection: 'genres',
      where: { id: { equals: genre.id } },
    })
    expect(found.docs.map((doc) => doc.id)).toEqual([genre.id])
    expect((await gateway.findByID(ctx, { collection: 'genres', id: genre.id })).id).toBe(genre.id)
  })

  it('lets a signed-out request read nothing', async () => {
    const genre = await systemCreate(unique('Signed Out Genre'))
    await expect(
      payload.find({
        collection: 'genres',
        where: { id: { equals: genre.id } },
        req: await createLocalReq({}, payload),
        user: null,
        overrideAccess: false,
      }),
    ).rejects.toThrow(Forbidden)
  })

  it('refuses every write by a user', async () => {
    const genre = await systemCreate(unique('Locked Genre'))
    const ctx = await contextFor(user)
    await expect(
      gateway.create(ctx, { collection: 'genres', data: { name: unique('Typed'), nameKey: '' } }),
    ).rejects.toThrow(Forbidden)
    await expect(
      gateway.updateByID(ctx, { collection: 'genres', id: genre.id, data: { name: 'Hijacked' } }),
    ).rejects.toThrow(Forbidden)
    await expect(gateway.deleteByID(ctx, { collection: 'genres', id: genre.id })).rejects.toThrow(
      Forbidden,
    )
    const unchanged = await payload.findByID({ collection: 'genres', id: genre.id })
    expect(unchanged.name).toBe(genre.name)
  })

  it('lets the admin create, rename and delete through access', async () => {
    const ctx = await contextFor(admin)
    const genre = await gateway.create(ctx, {
      collection: 'genres',
      data: { name: unique('Admin Genre'), nameKey: '' },
    })
    const name = unique('Admin Renamed Genre')
    const renamed = await gateway.updateByID(ctx, {
      collection: 'genres',
      id: genre.id,
      data: { name, nameFi: 'Historia' },
    })
    expect(renamed).toMatchObject({ name, nameFi: 'Historia' })
    await gateway.deleteByID(ctx, { collection: 'genres', id: genre.id })
    expect(
      await payload.count({ collection: 'genres', where: { id: { equals: genre.id } } }),
    ).toEqual({ totalDocs: 0 })
  })

  it('keeps nameKey unique', async () => {
    const suffix = randomUUID().slice(0, 8)
    await systemCreate(`Science Fiction ${suffix}`)
    await expect(systemCreate(` science  fiction ${suffix} `)).rejects.toThrow(ValidationError)
  })

  it('rejects a name over 200 characters', async () => {
    const ctx = await contextFor(admin)
    const result = await runAction(() =>
      gateway.create(ctx, { collection: 'genres', data: { name: 'x'.repeat(201), nameKey: '' } }),
    )
    expect(result).toEqual({ ok: false, code: 'VALIDATION', fields: { name: 'VALIDATION' } })
  })
})
