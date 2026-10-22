import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { updateProfile } from '@/lib/account/profile'
import { mergeLocation, renameLocation } from '@/lib/copies/locations'
import { withTransaction } from '@/lib/payload/transaction'
import config from '@/payload.config'
import type { Book, Copy, User, UserLocation } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `renameLocation()` and `mergeLocation()`, AD-18/FR-31: a rename onto another
// of my names fails `NAME_TAKEN` with its id; a merge moves my copies and
// default to the target and deletes the source, in one transaction. No Undo.

describe('renameLocation and mergeLocation', () => {
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

  const stored = async (id: number) => {
    const { docs } = await payload.find({
      collection: 'locations',
      where: { id: { equals: id } },
      depth: 0,
    })
    const doc = docs[0]
    return doc ? { name: doc.name, nameKey: doc.nameKey } : null
  }

  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e)

  beforeAll(async () => {
    payload = await getPayload({ config })
    const creator = await createUser({ displayName: 'Rename Merge Book' })
    book = await payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(creator)).req,
    })
  })

  it('renames a location, normalised, and allows a case-only rename of itself', async () => {
    const a = await createUser({ displayName: 'Rename Location' })
    const asA = await contextFor(a)
    const l = await locationFor(a, 'Olohuone')
    const m = await locationFor(a, 'mokki')

    await renameLocation(asA, l.id, '  Työ   huone ')
    await renameLocation(asA, m.id, 'Mokki')

    expect(await stored(l.id)).toEqual({ name: 'Työ huone', nameKey: 'työ huone' })
    expect(await stored(m.id)).toEqual({ name: 'Mokki', nameKey: 'mokki' })
  })

  it("fails NAME_TAKEN with the other location's id, writing nothing", async () => {
    const a = await createUser({ displayName: 'Rename Location Taken' })
    const l = await locationFor(a, 'Olohuone')
    const m = await locationFor(a, 'Mökki')

    expect(await failure(renameLocation(await contextFor(a), l.id, 'MÖKKI'))).toMatchObject({
      code: 'NAME_TAKEN',
      conflictId: m.id,
    })
    expect(await stored(l.id)).toEqual({ name: 'Olohuone', nameKey: 'olohuone' })
  })

  it('moves my copies and default to the target, then deletes the source', async () => {
    const a = await createUser({ displayName: 'Merge Location' })
    const asA = await contextFor(a)
    const s = await locationFor(a, 'Olohuone')
    const t = await locationFor(a, 'Mökki')
    const u = await locationFor(a, 'Vintti')
    const c1 = await copyFor(a, s.id)
    const c2 = await copyFor(a, s.id)
    const c3 = await copyFor(a, t.id)
    const c4 = await copyFor(a, u.id)
    await updateProfile(asA, { defaultLocation: s.id })

    await mergeLocation(asA, s.id, t.id)

    expect(await stored(s.id)).toBeNull()
    expect(await locationOf(c1.id)).toBe(t.id)
    expect(await locationOf(c2.id)).toBe(t.id)
    expect(await locationOf(c3.id)).toBe(t.id)
    expect(await locationOf(c4.id)).toBe(u.id)
    expect(await defaultOf(a)).toBe(t.id)
  })

  it("rolls a merge back with the caller's transaction", async () => {
    const a = await createUser({ displayName: 'Merge Location Rollback' })
    const asA = await contextFor(a)
    const s = await locationFor(a, 'Olohuone')
    const t = await locationFor(a, 'Mökki')
    const c1 = await copyFor(a, s.id)
    await updateProfile(asA, { defaultLocation: s.id })

    const e = new Error('after')
    await expect(
      withTransaction(asA, async (tx) => {
        await mergeLocation(tx, s.id, t.id)
        throw e
      }),
    ).rejects.toBe(e)

    expect(await stored(s.id)).not.toBeNull()
    expect(await locationOf(c1.id)).toBe(s.id)
    expect(await defaultOf(a)).toBe(s.id)
  })

  it("refuses another user's location and bad ids with NOT_FOUND, writing nothing", async () => {
    const a = await createUser({ displayName: 'Rename Merge Viewer' })
    const admin = await createUser({ displayName: 'Rename Merge Admin', roles: ['admin'] })
    const b = await createUser({ displayName: 'Rename Merge Other' })
    const shelf = await locationFor(b, 'Hylly')
    const theirs = await copyFor(b, shelf.id)
    await updateProfile(await contextFor(b), { defaultLocation: shelf.id })
    const gone = await locationFor(a, 'Vintti')
    await payload.delete({ collection: 'locations', id: gone.id })
    const mine = await locationFor(a, 'Olohuone')
    const mineAsAdmin = await locationFor(admin, 'Olohuone')
    const c1 = await copyFor(a, mine.id)
    await updateProfile(await contextFor(a), { defaultLocation: mine.id })

    const notFound = { code: 'NOT_FOUND' }
    for (const [viewer, own] of [
      [a, mine.id],
      [admin, mineAsAdmin.id],
    ] as const) {
      const ctx = await contextFor(viewer)
      expect(await failure(renameLocation(ctx, shelf.id, 'Kirjasto'))).toMatchObject(notFound)
      expect(await failure(mergeLocation(ctx, shelf.id, own))).toMatchObject(notFound)
      expect(await failure(mergeLocation(ctx, own, shelf.id))).toMatchObject(notFound)
    }
    const asA = await contextFor(a)
    for (const bad of [gone.id, 0]) {
      expect(await failure(renameLocation(asA, bad, 'Kirjasto'))).toMatchObject(notFound)
      expect(await failure(mergeLocation(asA, bad, mine.id))).toMatchObject(notFound)
      expect(await failure(mergeLocation(asA, mine.id, bad))).toMatchObject(notFound)
    }

    expect(await stored(shelf.id)).toEqual({ name: 'Hylly', nameKey: 'hylly' })
    expect(await locationOf(theirs.id)).toBe(shelf.id)
    expect(await defaultOf(b)).toBe(shelf.id)
    expect(await stored(mine.id)).toEqual({ name: 'Olohuone', nameKey: 'olohuone' })
    expect(await stored(mineAsAdmin.id)).toEqual({ name: 'Olohuone', nameKey: 'olohuone' })
    expect(await locationOf(c1.id)).toBe(mine.id)
    expect(await defaultOf(a)).toBe(mine.id)
  })

  it('refuses to merge a location into itself with VALIDATION', async () => {
    const a = await createUser({ displayName: 'Merge Location Itself' })
    const s = await locationFor(a, 'Olohuone')
    const c1 = await copyFor(a, s.id)

    expect(await failure(mergeLocation(await contextFor(a), s.id, s.id))).toMatchObject({
      code: 'VALIDATION',
    })
    expect(await stored(s.id)).toEqual({ name: 'Olohuone', nameKey: 'olohuone' })
    expect(await locationOf(c1.id)).toBe(s.id)
  })
})
