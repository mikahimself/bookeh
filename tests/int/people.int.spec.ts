import { Forbidden, getPayload, NotFound, type Payload, ValidationError } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Person, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { rejectedPaths } from '../helpers/validation'

// `people`, AD-1/AD-2/AD-19, FR-34: owner from the request, owner-scoped
// access that binds the admin too, one name per owner by key in the database.

const ownerId = (doc: { owner: number | User }): number =>
  typeof doc.owner === 'number' ? doc.owner : doc.owner.id

describe('people', () => {
  let payload: Payload
  let a: User
  let b: User
  let admin: User

  /**
   * A Person created by `user` through the gateway; `owner` and `nameKey`
   * only satisfy the create type, the hooks set both.
   */
  const personAs = async (user: User, data: Partial<Person> = {}) =>
    gateway.create(await contextFor(user), {
      collection: 'people',
      data: { owner: user.id, name: 'Liisa', nameKey: 'ignored', ...data },
      depth: 0,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'People User A' })
    b = await createUser({ displayName: 'People User B' })
    admin = await createUser({ displayName: 'People Admin', roles: ['admin'] })
  })

  it('saves a Person for the request user, keyed from its name', async () => {
    const person = await personAs(a, { owner: b.id, name: '  Liisa  ' })
    expect(ownerId(person)).toBe(a.id)
    expect(person.name).toBe('  Liisa  ')
    expect(person.nameKey).toBe('liisa')

    const asA = await contextFor(a)
    expect((await gateway.findByID(asA, { collection: 'people', id: person.id })).id).toBe(
      person.id,
    )
    const found = await gateway.find(asA, {
      collection: 'people',
      where: { id: { equals: person.id } },
    })
    expect(found.docs.map((doc) => doc.id)).toEqual([person.id])
  })

  it('hides a Person from another user and the admin, and refuses their writes', async () => {
    const person = await personAs(a, { name: 'Mine' })
    for (const user of [b, admin]) {
      const ctx = await contextFor(user)
      const seen = await gateway.find(ctx, {
        collection: 'people',
        where: { id: { equals: person.id } },
      })
      expect(seen.docs).toEqual([])
      await expect(gateway.findByID(ctx, { collection: 'people', id: person.id })).rejects.toThrow(
        NotFound,
      )
      await expect(
        gateway.updateByID(ctx, { collection: 'people', id: person.id, data: { name: 'Theirs' } }),
      ).rejects.toThrow(Forbidden)
      await expect(
        gateway.deleteByID(ctx, { collection: 'people', id: person.id }),
      ).rejects.toThrow(Forbidden)
    }
    const unchanged = await payload.findByID({ collection: 'people', id: person.id, depth: 0 })
    expect(unchanged.name).toBe('Mine')
    expect(ownerId(unchanged)).toBe(a.id)
  })

  it('keeps one name per owner, compared by key', async () => {
    await personAs(a, { name: 'Matti' })
    await expect(personAs(a, { name: 'matti' })).rejects.toThrow(ValidationError)
    expect((await personAs(b, { name: 'Matti' })).nameKey).toBe('matti')
  })

  it('rejects a blank name', async () => {
    expect(await rejectedPaths(personAs(a, { name: '   ' }))).toEqual(['name'])
  })
})
