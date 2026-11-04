import {
  createLocalReq,
  Forbidden,
  getPayload,
  NotFound,
  type Payload,
  ValidationError,
} from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { limits } from '@/fields/limits'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Tag, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { rejectedPaths } from '../helpers/validation'

describe('tags', () => {
  let payload: Payload
  let a: User
  let b: User
  let admin: User

  const create = async (user: User, data: Partial<Tag> = {}) =>
    gateway.create(await contextFor(user), {
      collection: 'tags',
      data: { owner: user.id, name: 'Label', nameKey: 'ignored', kind: 'tag', ...data },
      depth: 0,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser()
    b = await createUser()
    admin = await createUser({ roles: ['admin'] })
  })

  it('derives ownership and normalized names, ignoring submitted keys on create and update', async () => {
    const tag = await create(a, { owner: b.id, name: '  MO\u0308KKI \t books  ' })
    expect(tag).toMatchObject({ owner: a.id, nameKey: 'mökki books' })
    const ctx = await contextFor(a)
    const updated = await gateway.updateByID(ctx, {
      collection: 'tags',
      id: tag.id,
      data: { owner: b.id, name: ' New  Name ', nameKey: 'forged' },
      depth: 0,
    })
    expect(updated).toMatchObject({ owner: a.id, nameKey: 'new name' })
    expect(
      await gateway.updateByID(ctx, {
        collection: 'tags',
        id: tag.id,
        data: { nameKey: 'forged' },
      }),
    ).toMatchObject({ nameKey: 'new name' })
    expect((await gateway.findByID(ctx, { collection: 'tags', id: tag.id })).id).toBe(tag.id)
    await gateway.deleteByID(ctx, { collection: 'tags', id: tag.id })
    await expect(payload.findByID({ collection: 'tags', id: tag.id })).rejects.toThrow(NotFound)
  })

  it('requires a bounded nonblank name and a valid kind', async () => {
    for (const name of [undefined, '', ' \t ', 'a'.repeat(limits.name + 1)]) {
      expect(await rejectedPaths(create(a, { name }))).toContain('name')
    }
    for (const kind of [undefined, 'invalid' as Tag['kind']]) {
      expect(await rejectedPaths(create(a, { kind }))).toEqual(['kind'])
    }
  })

  it('enforces normalized uniqueness within owner and kind on create and update', async () => {
    await create(a, { name: '  MO\u0308KKI  books ' })
    await expect(create(a, { name: 'mökki\tbooks' })).rejects.toThrow(ValidationError)
    for (const kind of ['genre', 'theme'] as const) {
      expect((await create(a, { name: 'Mökki books', kind })).kind).toBe(kind)
    }
    expect((await create(b, { name: 'Mökki books' })).owner).toBe(b.id)
    const other = await create(a, { name: 'Other' })
    await expect(
      gateway.updateByID(await contextFor(a), {
        collection: 'tags',
        id: other.id,
        data: { name: 'MÖKKI books' },
      }),
    ).rejects.toThrow(ValidationError)
    expect((await payload.findByID({ collection: 'tags', id: other.id })).name).toBe('Other')
  })

  it('hides private labels and refuses foreign writes for users and admins', async () => {
    const tag = await create(a, { name: 'Private' })
    for (const user of [b, admin]) {
      const ctx = await contextFor(user)
      expect(
        (await gateway.find(ctx, { collection: 'tags', where: { id: { equals: tag.id } } })).docs,
      ).toEqual([])
      await expect(gateway.findByID(ctx, { collection: 'tags', id: tag.id })).rejects.toThrow(
        NotFound,
      )
      await expect(
        gateway.updateByID(ctx, { collection: 'tags', id: tag.id, data: { name: 'Stolen' } }),
      ).rejects.toThrow(Forbidden)
      await expect(gateway.deleteByID(ctx, { collection: 'tags', id: tag.id })).rejects.toThrow(
        Forbidden,
      )
    }
    expect((await payload.findByID({ collection: 'tags', id: tag.id })).name).toBe('Private')
    // An admin still owns and manages their own private labels.
    const own = await create(admin)
    await gateway.deleteByID(await contextFor(admin), { collection: 'tags', id: own.id })
  })

  it('refuses all anonymous operations', async () => {
    const tag = await create(a, { name: 'Anonymous guard' })
    const anonymous = async () => ({
      req: await createLocalReq({}, payload),
      user: null,
      overrideAccess: false as const,
    })
    const collection = 'tags' as const
    await expect(
      payload.create({
        collection,
        data: { owner: a.id, name: 'X', nameKey: 'x', kind: 'tag' },
        ...(await anonymous()),
      }),
    ).rejects.toThrow(Forbidden)
    await expect(payload.find({ collection, ...(await anonymous()) })).rejects.toThrow(Forbidden)
    await expect(
      payload.findByID({ collection, id: tag.id, ...(await anonymous()) }),
    ).rejects.toThrow(Forbidden)
    await expect(
      payload.update({ collection, id: tag.id, data: { name: 'X' }, ...(await anonymous()) }),
    ).rejects.toThrow(Forbidden)
    await expect(
      payload.delete({ collection, id: tag.id, ...(await anonymous()) }),
    ).rejects.toThrow(Forbidden)
    expect((await payload.findByID({ collection, id: tag.id })).name).toBe('Anonymous guard')
  })
})
