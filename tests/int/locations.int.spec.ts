import { Forbidden, getPayload, NotFound, type Payload, ValidationError } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, Copy, User, UserLocation } from '@/payload-types'

import { as, contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'
import { rejectedPaths } from '../helpers/validation'

// `locations`, AD-1/AD-17/AD-19: owner from the request, owner-scoped access
// that binds the admin too, one name per owner by key; `copies.location` and
// `users.defaultLocation` take the owner's locations only, an ordered copy has
// none (AD-8), and the admin never reads or writes another user's default
// (FR-48) without locking that user's row.

const ownerId = (doc: { owner: number | User }): number =>
  typeof doc.owner === 'number' ? doc.owner : doc.owner.id

describe('locations', () => {
  let payload: Payload
  let a: User
  let b: User
  let admin: User
  let shared: Book

  /**
   * A location created by `user` through the gateway; `owner` and `nameKey`
   * only satisfy the create type, the hooks set both.
   */
  const locationAs = async (user: User, data: Partial<UserLocation> = {}) =>
    gateway.create(await contextFor(user), {
      collection: 'locations',
      data: { owner: user.id, name: 'Hylly', nameKey: 'ignored', ...data },
      depth: 0,
    })

  const copyAs = async (user: User, data: Partial<Copy> = {}) =>
    gateway.create(await contextFor(user), {
      collection: 'copies',
      data: { owner: user.id, book: shared.id, status: 'owned', ...data },
      depth: 0,
    })

  /** The user's own profile write, as the profile path makes it. */
  const updateSelf = async (user: User, data: Partial<User>) =>
    gateway.updateByID(await contextFor(user), {
      collection: 'users',
      id: user.id,
      data,
      depth: 0,
    })

  /** Reads past access: what the row holds. */
  const storedLocation = (id: number) => payload.findByID({ collection: 'locations', id, depth: 0 })
  const storedCopy = (id: number) => payload.findByID({ collection: 'copies', id, depth: 0 })
  const storedUser = (id: number) => payload.findByID({ collection: 'users', id, depth: 0 })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Locations User A' })
    b = await createUser({ displayName: 'Locations User B' })
    admin = await createUser({ displayName: 'Locations Admin', roles: ['admin'] })
    shared = await payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(a)).req,
    })
  })

  it('saves a location for the request user, keyed from its name', async () => {
    const location = await locationAs(a, { owner: b.id, name: '  Mökki  ' })
    expect(ownerId(location)).toBe(a.id)
    expect(location.name).toBe('  Mökki  ')
    expect(location.nameKey).toBe('mökki')

    const asA = await contextFor(a)
    expect((await gateway.findByID(asA, { collection: 'locations', id: location.id })).id).toBe(
      location.id,
    )
    const found = await gateway.find(asA, {
      collection: 'locations',
      where: { id: { equals: location.id } },
    })
    expect(found.docs.map((doc) => doc.id)).toEqual([location.id])
  })

  it('hides a location from another user and the admin, and refuses their writes', async () => {
    const location = await locationAs(a, { name: 'Mine' })
    for (const user of [b, admin]) {
      const ctx = await contextFor(user)
      const seen = await gateway.find(ctx, {
        collection: 'locations',
        where: { id: { equals: location.id } },
      })
      expect(seen.docs).toEqual([])
      await expect(
        gateway.findByID(ctx, { collection: 'locations', id: location.id }),
      ).rejects.toThrow(NotFound)
      await expect(
        gateway.updateByID(ctx, {
          collection: 'locations',
          id: location.id,
          data: { name: 'Theirs' },
        }),
      ).rejects.toThrow(Forbidden)
      await expect(
        gateway.deleteByID(ctx, { collection: 'locations', id: location.id }),
      ).rejects.toThrow(Forbidden)
    }
    const unchanged = await storedLocation(location.id)
    expect(unchanged.name).toBe('Mine')
    expect(ownerId(unchanged)).toBe(a.id)
  })

  it('keeps one name per owner, compared by key', async () => {
    await locationAs(a, { name: 'Tampere' })
    await expect(locationAs(a, { name: 'tampere' })).rejects.toThrow(ValidationError)
    expect((await locationAs(b, { name: 'Tampere' })).nameKey).toBe('tampere')
  })

  it("puts a copy at one of the owner's locations only", async () => {
    const own = await locationAs(a, { name: 'Olohuone' })
    expect((await copyAs(a, { location: own.id })).location).toBe(own.id)

    const foreign = await locationAs(b, { name: 'Olohuone' })
    expect(await rejectedPaths(copyAs(a, { location: foreign.id }))).toEqual(['location'])
    const { totalDocs } = await payload.count({
      collection: 'copies',
      where: { location: { equals: foreign.id } },
    })
    expect(totalDocs).toBe(0)
  })

  it('keeps an ordered copy without a location', async () => {
    const own = await locationAs(a, { name: 'Varasto' })
    expect(await rejectedPaths(copyAs(a, { status: 'ordered', location: own.id }))).toEqual([
      'location',
    ])

    const copy = await copyAs(a, { location: own.id })
    const asA = await contextFor(a)
    const update = (data: Partial<Copy>) =>
      gateway.updateByID(asA, { collection: 'copies', id: copy.id, data, depth: 0 })

    // Status alone: the stored location still applies, so the write fails on it.
    expect(await rejectedPaths(update({ status: 'ordered' }))).toEqual(['location'])
    expect(await storedCopy(copy.id)).toMatchObject({ status: 'owned', location: own.id })

    const ordered = await update({ status: 'ordered', location: null })
    expect(ordered).toMatchObject({ status: 'ordered', location: null })

    // Location alone on an ordered copy: the stored status still applies.
    expect(await rejectedPaths(update({ location: own.id }))).toEqual(['location'])
    expect((await storedCopy(copy.id)).location).toBeNull()
  })

  it("lets a user set and clear their own default, never another user's location", async () => {
    const own = await locationAs(a, { name: 'Oletus' })
    expect((await updateSelf(a, { defaultLocation: own.id })).defaultLocation).toBe(own.id)
    expect((await storedUser(a.id)).defaultLocation).toBe(own.id)

    const foreign = await locationAs(b, { name: 'Oletus' })
    expect(await rejectedPaths(updateSelf(a, { defaultLocation: foreign.id }))).toEqual([
      'defaultLocation',
    ])
    expect((await storedUser(a.id)).defaultLocation).toBe(own.id)

    expect((await updateSelf(a, { defaultLocation: null })).defaultLocation).toBeNull()
    expect((await storedUser(a.id)).defaultLocation).toBeNull()
  })

  it("keeps the admin out of another user's default without locking the row", async () => {
    const c = await createUser({ displayName: 'Locations User C' })
    const own = await locationAs(c, { name: 'Oma' })
    await updateSelf(c, { defaultLocation: own.id })
    const adminsOwn = await locationAs(admin, { name: 'Oma' })

    const asAdmin = await contextFor(admin)
    const hijacked = await gateway.updateByID(asAdmin, {
      collection: 'users',
      id: c.id,
      data: { defaultLocation: adminsOwn.id },
      depth: 0,
    })
    expect(hijacked).not.toHaveProperty('defaultLocation')
    expect((await storedUser(c.id)).defaultLocation).toBe(own.id)

    const read = await payload.findByID({ collection: 'users', id: c.id, ...(await as(admin)) })
    expect(read).not.toHaveProperty('defaultLocation')

    // An admin's edit of another field and a password reset both update the
    // row without the user on the request: neither may fail on the default.
    const renamed = await gateway.updateByID(asAdmin, {
      collection: 'users',
      id: c.id,
      data: { displayName: 'Renamed by admin' },
      depth: 0,
    })
    expect(renamed.displayName).toBe('Renamed by admin')
    const token = await payload.forgotPassword({
      collection: 'users',
      data: { email: c.email },
      disableEmail: true,
    })
    expect(typeof token).toBe('string')
    expect((await storedUser(c.id)).defaultLocation).toBe(own.id)
  })
})
