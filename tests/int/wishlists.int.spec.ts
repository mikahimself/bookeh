import { Forbidden, getPayload, NotFound, type Payload, ValidationError } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { User, Wishlist } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { rejectedPaths } from '../helpers/validation'

// `wishlists`, AD-1/AD-2/AD-19, FR-38: owner from the request, owner-scoped
// access that binds the admin too, one name per owner by key in the database.

const ownerId = (doc: { owner: number | User }): number =>
  typeof doc.owner === 'number' ? doc.owner : doc.owner.id

describe('wishlists', () => {
  let payload: Payload
  let a: User
  let b: User
  let admin: User

  /**
   * A wishlist created by `user` through the gateway; `owner` and `nameKey`
   * only satisfy the create type, the hooks set both.
   */
  const wishlistAs = async (user: User, data: Partial<Wishlist> = {}) =>
    gateway.create(await contextFor(user), {
      collection: 'wishlists',
      data: { owner: user.id, name: 'Me', nameKey: 'ignored', ...data },
      depth: 0,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Wishlists User A' })
    b = await createUser({ displayName: 'Wishlists User B' })
    admin = await createUser({ displayName: 'Wishlists Admin', roles: ['admin'] })
  })

  it('saves a wishlist for the request user, keyed from its name', async () => {
    const list = await wishlistAs(a, { owner: b.id, name: '  Christmas  ' })
    expect(ownerId(list)).toBe(a.id)
    expect(list.name).toBe('  Christmas  ')
    expect(list.nameKey).toBe('christmas')

    const asA = await contextFor(a)
    expect((await gateway.findByID(asA, { collection: 'wishlists', id: list.id })).id).toBe(list.id)
    const found = await gateway.find(asA, {
      collection: 'wishlists',
      where: { id: { equals: list.id } },
    })
    expect(found.docs.map((doc) => doc.id)).toEqual([list.id])
  })

  it('hides a wishlist from another user and the admin, and refuses their writes', async () => {
    const list = await wishlistAs(a, { name: 'Mine' })
    for (const user of [b, admin]) {
      const ctx = await contextFor(user)
      const seen = await gateway.find(ctx, {
        collection: 'wishlists',
        where: { id: { equals: list.id } },
      })
      expect(seen.docs).toEqual([])
      await expect(gateway.findByID(ctx, { collection: 'wishlists', id: list.id })).rejects.toThrow(
        NotFound,
      )
      await expect(
        gateway.updateByID(ctx, { collection: 'wishlists', id: list.id, data: { name: 'Theirs' } }),
      ).rejects.toThrow(Forbidden)
      await expect(
        gateway.deleteByID(ctx, { collection: 'wishlists', id: list.id }),
      ).rejects.toThrow(Forbidden)
    }
    const unchanged = await payload.findByID({ collection: 'wishlists', id: list.id, depth: 0 })
    expect(unchanged.name).toBe('Mine')
    expect(ownerId(unchanged)).toBe(a.id)
  })

  it('keeps one name per owner, compared by key', async () => {
    await wishlistAs(a, { name: 'Me' })
    await expect(wishlistAs(a, { name: 'me' })).rejects.toThrow(ValidationError)
    expect((await wishlistAs(b, { name: 'Me' })).nameKey).toBe('me')
  })

  it('rejects a blank name', async () => {
    expect(await rejectedPaths(wishlistAs(a, { name: '   ' }))).toEqual(['name'])
  })
})
