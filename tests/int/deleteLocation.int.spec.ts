import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { updateProfile } from '@/lib/account/profile'
import { deleteLocation } from '@/lib/copies/locations'
import { withTransaction } from '@/lib/payload/transaction'
import config from '@/payload.config'
import type { Book, Copy, User, UserLocation } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `deleteLocation()`, AD-18/FR-31: one transaction clears the location from
// the viewer's copies and profile default, then deletes it. No Undo.

describe('deleteLocation', () => {
  let payload: Payload
  let book: Book

  const locationFor = async (user: User, name: string): Promise<UserLocation> =>
    payload.create({
      collection: 'locations',
      data: { owner: user.id, name, nameKey: '' },
      overrideAccess: false,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const copyFor = async (user: User, location: number | null): Promise<Copy> =>
    payload.create({
      collection: 'copies',
      data: { owner: user.id, book: book.id, status: 'owned', location },
      overrideAccess: false,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const locationOf = async (id: number) =>
    (await payload.findByID({ collection: 'copies', id, depth: 0 })).location ?? null

  const defaultOf = async (user: User) =>
    (await payload.findByID({ collection: 'users', id: user.id, depth: 0 })).defaultLocation ?? null

  const exists = async (id: number) =>
    (await payload.count({ collection: 'locations', where: { id: { equals: id } } })).totalDocs ===
    1

  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e)

  beforeAll(async () => {
    payload = await getPayload({ config })
    const creator = await createUser({ displayName: 'Delete Location Book' })
    book = await payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(creator)).req,
    })
  })

  it('clears the location from my copies and my default, then deletes it', async () => {
    const a = await createUser({ displayName: 'Delete Location Both' })
    const asA = await contextFor(a)
    const l = await locationFor(a, 'Olohuone')
    const m = await locationFor(a, 'Mökki')
    const c1 = await copyFor(a, l.id)
    const c2 = await copyFor(a, l.id)
    const c3 = await copyFor(a, m.id)
    await updateProfile(asA, { defaultLocation: l.id })

    await deleteLocation(asA, l.id)

    expect(await exists(l.id)).toBe(false)
    expect(await locationOf(c1.id)).toBeNull()
    expect(await locationOf(c2.id)).toBeNull()
    expect(await locationOf(c3.id)).toBe(m.id)
    expect(await defaultOf(a)).toBeNull()
  })

  it('keeps a default that points elsewhere', async () => {
    const a = await createUser({ displayName: 'Delete Location Other Default' })
    const asA = await contextFor(a)
    const l = await locationFor(a, 'Olohuone')
    const m = await locationFor(a, 'Mökki')
    const c1 = await copyFor(a, l.id)
    await updateProfile(asA, { defaultLocation: m.id })

    await deleteLocation(asA, l.id)

    expect(await exists(l.id)).toBe(false)
    expect(await locationOf(c1.id)).toBeNull()
    expect(await defaultOf(a)).toBe(m.id)
  })

  it("refuses another user's location and bad ids with NOT_FOUND, writing nothing", async () => {
    const a = await createUser({ displayName: 'Delete Location Viewer' })
    const admin = await createUser({ displayName: 'Delete Location Admin', roles: ['admin'] })
    const b = await createUser({ displayName: 'Delete Location Other' })
    const shelf = await locationFor(b, 'Hylly')
    const theirs = await copyFor(b, shelf.id)
    await updateProfile(await contextFor(b), { defaultLocation: shelf.id })
    const gone = await locationFor(a, 'Vintti')
    await payload.delete({ collection: 'locations', id: gone.id })

    const notFound = { code: 'NOT_FOUND' }
    for (const viewer of [a, admin]) {
      expect(await failure(deleteLocation(await contextFor(viewer), shelf.id))).toMatchObject(
        notFound,
      )
    }
    expect(await failure(deleteLocation(await contextFor(a), gone.id))).toMatchObject(notFound)
    expect(await failure(deleteLocation(await contextFor(a), 0))).toMatchObject(notFound)

    expect(await exists(shelf.id)).toBe(true)
    expect(await locationOf(theirs.id)).toBe(shelf.id)
    expect(await defaultOf(b)).toBe(shelf.id)
  })

  it("rolls everything back with the caller's transaction", async () => {
    const a = await createUser({ displayName: 'Delete Location Rollback' })
    const asA = await contextFor(a)
    const l = await locationFor(a, 'Olohuone')
    const c1 = await copyFor(a, l.id)
    await updateProfile(asA, { defaultLocation: l.id })

    const e = new Error('after')
    await expect(
      withTransaction(asA, async (tx) => {
        await deleteLocation(tx, l.id)
        throw e
      }),
    ).rejects.toBe(e)

    expect(await exists(l.id)).toBe(true)
    expect(await locationOf(c1.id)).toBe(l.id)
    expect(await defaultOf(a)).toBe(l.id)
  })
})
