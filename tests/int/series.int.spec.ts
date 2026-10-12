import { randomUUID } from 'node:crypto'

import { Forbidden, getPayload, NotFound, type Payload, ValidationError } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Series, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'

// `series`, AD-4/AD-5/AD-19: the same rules as `authors`, whose spec proves
// the shared helpers' branches. Here only that `series` is wired to them:
// read scoping, refused user writes and the per-scope `nameKey` indexes.
// Shared names carry a per-run suffix (the shared index is global).

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

describe('series', () => {
  let payload: Payload
  let a: User
  let b: User
  let admin: User

  /** A system write (as `lib/catalogue` makes it) with `user` on the request. */
  const systemCreate = async (user: User, name: string, visibility: Series['visibility']) =>
    payload.create({
      collection: 'series',
      data: { name, visibility, nameKey: '' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Series User A' })
    b = await createUser({ displayName: 'Series User B' })
    admin = await createUser({ displayName: 'Series Admin', roles: ['admin'] })
  })

  it('hides a private series from another user and shows it to its creator and the admin', async () => {
    const own = await systemCreate(a, unique('Private Series'), 'private')
    const shared = await systemCreate(a, unique('Visible Series'), 'shared')
    const where = { id: { in: [own.id, shared.id] } }

    const asB = await contextFor(b)
    const seenByB = await gateway.find(asB, { collection: 'series', where })
    expect(seenByB.docs.map((doc) => doc.id)).toEqual([shared.id])
    await expect(gateway.findByID(asB, { collection: 'series', id: own.id })).rejects.toThrow(
      NotFound,
    )
    expect((await gateway.findByID(asB, { collection: 'series', id: shared.id })).id).toBe(
      shared.id,
    )

    const asA = await contextFor(a)
    expect((await gateway.findByID(asA, { collection: 'series', id: own.id })).id).toBe(own.id)

    const asAdmin = await contextFor(admin)
    const seenByAdmin = await gateway.find(asAdmin, { collection: 'series', where, sort: 'id' })
    expect(seenByAdmin.docs.map((doc) => doc.id)).toEqual([own.id, shared.id])
  })

  it('refuses every write by a user', async () => {
    const own = await systemCreate(a, unique('Locked Series'), 'private')
    const ctx = await contextFor(a)
    for (const visibility of ['shared', 'private'] as const) {
      await expect(
        gateway.create(ctx, {
          collection: 'series',
          data: { name: unique('Typed Series'), nameKey: '', visibility },
        }),
      ).rejects.toThrow(Forbidden)
    }
    await expect(
      gateway.updateByID(ctx, { collection: 'series', id: own.id, data: { name: 'Hijacked' } }),
    ).rejects.toThrow(Forbidden)
    await expect(gateway.deleteByID(ctx, { collection: 'series', id: own.id })).rejects.toThrow(
      Forbidden,
    )
    const unchanged = await payload.findByID({ collection: 'series', id: own.id })
    expect(unchanged.name).toBe(own.name)
  })

  it('keeps nameKey unique among shared rows and per creator among private rows', async () => {
    const name = unique('Muumit')
    await systemCreate(a, name, 'shared')
    await expect(systemCreate(b, ` ${name.toLowerCase()} `, 'shared')).rejects.toThrow(
      ValidationError,
    )

    await systemCreate(a, name, 'private')
    await systemCreate(b, name, 'private')
    await expect(systemCreate(a, name.toUpperCase(), 'private')).rejects.toThrow(ValidationError)
  })
})
