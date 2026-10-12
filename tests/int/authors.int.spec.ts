import { randomUUID } from 'node:crypto'

import {
  createLocalReq,
  Forbidden,
  getPayload,
  NotFound,
  type Payload,
  ValidationError,
} from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { runAction } from '@/lib/errors'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Author, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'

// `authors`, AD-4/AD-5/AD-19: shared rows for everyone signed in, private rows
// for their creator and the admin; writes for the admin only; `nameKey`
// unique among shared rows and per creator among private ones. The shared
// index is global and rows are never cleaned up, so every name is unique per run.

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

type Visibility = Author['visibility']

describe('authors', () => {
  let payload: Payload
  let a: User
  let b: User
  let admin: User

  /** A system write (as `lib/catalogue` makes it) with `user` on the request. */
  const systemCreate = async (
    user: User,
    name: string,
    visibility: Visibility,
    extra: Partial<Author> = {},
  ) =>
    payload.create({
      collection: 'authors',
      data: { name, visibility, nameKey: '', ...extra },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const systemUpdate = async (user: User, id: number, data: Partial<Author>) =>
    payload.update({
      collection: 'authors',
      id,
      data,
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Author User A' })
    b = await createUser({ displayName: 'Author User B' })
    admin = await createUser({ displayName: 'Author Admin', roles: ['admin'] })
  })

  it('sets createdBy from the request on a private create and derives sortName', async () => {
    const author = await systemCreate(a, 'Tove Jansson', 'private', { createdBy: b.id })
    expect(author.createdBy).toBe(a.id)
    expect(author.sortName).toBe('Jansson, Tove')
  })

  it('leaves createdBy empty on a shared create', async () => {
    const author = await systemCreate(a, unique('Shared Author'), 'shared', { createdBy: a.id })
    expect(author.createdBy ?? null).toBeNull()
  })

  it('clears createdBy when a private row is promoted', async () => {
    const author = await systemCreate(a, unique('Promoted Author'), 'private')
    const promoted = await systemUpdate(a, author.id, { visibility: 'shared' })
    expect(promoted.id).toBe(author.id)
    expect(promoted.createdBy ?? null).toBeNull()
  })

  it('keeps the creator on an update by someone else', async () => {
    const author = await systemCreate(a, unique('Kept Author'), 'private')
    const renamed = await systemUpdate(admin, author.id, { name: unique('Renamed Author') })
    expect(renamed.createdBy).toBe(a.id)
  })

  it('hides a private author from another user and shows it to its creator and the admin', async () => {
    const own = await systemCreate(a, unique('Private Author'), 'private')
    const shared = await systemCreate(a, unique('Visible Author'), 'shared')
    const where = { id: { in: [own.id, shared.id] } }

    const asB = await contextFor(b)
    const seenByB = await gateway.find(asB, { collection: 'authors', where })
    expect(seenByB.docs.map((doc) => doc.id)).toEqual([shared.id])
    await expect(gateway.findByID(asB, { collection: 'authors', id: own.id })).rejects.toThrow(
      NotFound,
    )
    expect((await gateway.findByID(asB, { collection: 'authors', id: shared.id })).id).toBe(
      shared.id,
    )

    const asA = await contextFor(a)
    expect((await gateway.findByID(asA, { collection: 'authors', id: own.id })).id).toBe(own.id)

    const asAdmin = await contextFor(admin)
    const seenByAdmin = await gateway.find(asAdmin, { collection: 'authors', where, sort: 'id' })
    expect(seenByAdmin.docs.map((doc) => doc.id)).toEqual([own.id, shared.id])
  })

  it('lets a signed-out request read nothing', async () => {
    const shared = await systemCreate(a, unique('Signed Out Author'), 'shared')
    await expect(
      payload.find({
        collection: 'authors',
        where: { id: { equals: shared.id } },
        req: await createLocalReq({}, payload),
        user: null,
        overrideAccess: false,
      }),
    ).rejects.toThrow(Forbidden)
  })

  it('refuses every write by a user', async () => {
    const own = await systemCreate(a, unique('Locked Author'), 'private')
    const ctx = await contextFor(a)
    for (const visibility of ['shared', 'private'] as const) {
      await expect(
        gateway.create(ctx, {
          collection: 'authors',
          data: { name: unique('Typed Author'), nameKey: '', visibility },
        }),
      ).rejects.toThrow(Forbidden)
    }
    await expect(
      gateway.updateByID(ctx, { collection: 'authors', id: own.id, data: { name: 'Hijacked' } }),
    ).rejects.toThrow(Forbidden)
    await expect(gateway.deleteByID(ctx, { collection: 'authors', id: own.id })).rejects.toThrow(
      Forbidden,
    )
    const unchanged = await payload.findByID({ collection: 'authors', id: own.id })
    expect(unchanged.name).toBe(own.name)
  })

  it('keeps nameKey unique among shared rows and per creator among private rows', async () => {
    const suffix = randomUUID().slice(0, 8)
    await systemCreate(a, `Tove Jansson ${suffix}`, 'shared')
    await expect(systemCreate(b, ` tove  jansson ${suffix} `, 'shared')).rejects.toThrow(
      ValidationError,
    )

    const privateA = await systemCreate(a, `Tove Jansson ${suffix}`, 'private')
    await systemCreate(b, `Tove Jansson ${suffix}`, 'private')
    await expect(systemCreate(a, `TOVE JANSSON ${suffix}`, 'private')).rejects.toThrow(
      ValidationError,
    )

    await expect(systemUpdate(a, privateA.id, { visibility: 'shared' })).rejects.toThrow(
      ValidationError,
    )
    const stillPrivate = await payload.findByID({
      collection: 'authors',
      id: privateA.id,
      depth: 0,
    })
    expect(stillPrivate.visibility).toBe('private')
    expect(stillPrivate.createdBy).toBe(a.id)
  })

  it('rejects a name over 200 characters', async () => {
    const ctx = await contextFor(admin)
    const result = await runAction(() =>
      gateway.create(ctx, {
        collection: 'authors',
        data: { name: 'x'.repeat(201), nameKey: '', visibility: 'shared' },
      }),
    )
    expect(result).toEqual({ ok: false, code: 'VALIDATION', fields: { name: 'VALIDATION' } })
  })
})
