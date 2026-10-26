import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { deleteLocation } from '@/lib/copies/locations'
import { moveCopies } from '@/lib/copies/moveCopies'
import type { Context } from '@/lib/payload/context'
import { undo, withUndo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { Book, Copy, User, UserLocation } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `moveCopies()`, AD-18/AD-20/FR-33: one move of the viewer's owned copies in
// a selection to one location, ordered copies skipped and reported, undoable
// through `withUndo()`; a restore puts a copy whose previous location is gone
// at none. Each case uses a fresh user so location names never collide.

describe('moveCopies', () => {
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

  const copyFor = async (
    user: User,
    status: Copy['status'],
    location: number | null = null,
  ): Promise<Copy> =>
    payload.create({
      collection: 'copies',
      data: { owner: user.id, book: book.id, status, location },
      overrideAccess: false,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const locationOf = async (id: number) =>
    (await payload.findByID({ collection: 'copies', id, depth: 0 })).location ?? null

  const locationsOf = async (user: User) =>
    (await payload.count({ collection: 'locations', where: { owner: { equals: user.id } } }))
      .totalDocs

  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e)

  beforeAll(async () => {
    payload = await getPayload({ config })
    const creator = await createUser({ displayName: 'Move Copies Book' })
    book = await payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(creator)).req,
    })
  })

  it('moves every copy to an inline location and Undo puts each back', async () => {
    const a = await createUser({ displayName: 'Move Copies A' })
    const asA: Context = await contextFor(a)
    const home = await locationFor(a, 'Olohuone')
    const c1 = await copyFor(a, 'owned', home.id)
    const c2 = await copyFor(a, 'owned')

    const result = await withUndo(asA, (tx) =>
      moveCopies(tx, [c1.id, c2.id, c1.id], { create: 'Mökki' }),
    )
    const { docs } = await payload.find({
      collection: 'locations',
      where: { and: [{ owner: { equals: a.id } }, { name: { equals: 'Mökki' } }] },
      depth: 0,
    })
    const cabin = docs[0]?.id
    expect(cabin).toBeTypeOf('number')
    expect(result).toMatchObject({ location: cabin, moved: 2, skipped: [] })
    expect(await locationOf(c1.id)).toBe(cabin)
    expect(await locationOf(c2.id)).toBe(cabin)

    await undo(asA, result.undoToken)
    expect(await locationOf(c1.id)).toBe(home.id)
    expect(await locationOf(c2.id)).toBeNull()
    expect(await locationsOf(a)).toBe(2)
  })

  it('restores only the copies it changed and skips one that is gone', async () => {
    const a = await createUser({ displayName: 'Move Copies Restore' })
    const asA = await contextFor(a)
    const l1 = await locationFor(a, 'Olohuone')
    const l2 = await locationFor(a, 'Mökki')
    const c1 = await copyFor(a, 'owned', l1.id)
    const c2 = await copyFor(a, 'owned', l2.id)

    // c2 is already at l2: written once, not restored.
    const { undoToken, ...moved } = await withUndo(asA, (tx) =>
      moveCopies(tx, [c1.id, c2.id], l2.id),
    )
    expect(moved).toEqual({
      location: l2.id,
      moved: 1,
      skipped: [],
      undoSeconds: moved.undoSeconds,
    })
    const { data } = await moveCopies(asA, [c2.id], null)
    expect(data.location).toBeNull()
    expect(await locationOf(c2.id)).toBeNull()
    await payload.delete({ collection: 'copies', id: c1.id })

    await expect(undo(asA, undoToken)).resolves.toBeUndefined()
    expect(await locationOf(c2.id)).toBeNull()
  })

  it('restores a copy to no location when its previous location is gone', async () => {
    const a = await createUser({ displayName: 'Move Copies Gone Location' })
    const asA = await contextFor(a)
    const l1 = await locationFor(a, 'Olohuone')
    const l2 = await locationFor(a, 'Mökki')
    const c1 = await copyFor(a, 'owned', l1.id)

    const { undoToken } = await withUndo(asA, (tx) => moveCopies(tx, [c1.id], l2.id))
    expect(await locationOf(c1.id)).toBe(l2.id)
    await deleteLocation(asA, l1.id)

    await expect(undo(asA, undoToken)).resolves.toBeUndefined()
    expect(await locationOf(c1.id)).toBeNull()
    expect(await locationsOf(a)).toBe(1)
  })

  it('moves the owned copies, skips the ordered ones and names them', async () => {
    const a = await createUser({ displayName: 'Move Copies Ordered' })
    const asA = await contextFor(a)
    const home = await locationFor(a, 'Olohuone')
    const owned = await copyFor(a, 'owned', home.id)
    const ordered = await copyFor(a, 'ordered')

    const { data } = await moveCopies(asA, [owned.id, ordered.id], { create: 'Mökki' })
    expect(data).toMatchObject({ moved: 1, skipped: [ordered.id] })
    expect(data.location).toBeTypeOf('number')
    expect(await locationOf(owned.id)).toBe(data.location)
    expect(await locationOf(ordered.id)).toBeNull()
    expect(await locationsOf(a)).toBe(2)

    // Nothing owned: nothing written, no location created, still a success.
    const nothing = await moveCopies(asA, [ordered.id], { create: 'Kellari' })
    expect(nothing.data).toEqual({ location: null, moved: 0, skipped: [ordered.id] })
    expect(await locationOf(ordered.id)).toBeNull()
    expect(await locationsOf(a)).toBe(2)
  })

  it("refuses another user's copy and bad ids with NOT_FOUND, moving nothing", async () => {
    const a = await createUser({ displayName: 'Move Copies Owner' })
    const b = await createUser({ displayName: 'Move Copies Other' })
    const asA = await contextFor(a)
    const home = await locationFor(a, 'Olohuone')
    const mine = await copyFor(a, 'owned', home.id)
    const shelf = await locationFor(b, 'Hylly')
    const theirs = await copyFor(b, 'owned', shelf.id)

    const notFound = { code: 'NOT_FOUND' }
    expect(await failure(moveCopies(asA, [mine.id, theirs.id], null))).toMatchObject(notFound)
    expect(await locationOf(mine.id)).toBe(home.id)
    expect(await locationOf(theirs.id)).toBe(shelf.id)

    expect(await failure(moveCopies(asA, [], null))).toMatchObject(notFound)
    expect(await failure(moveCopies(asA, [0], null))).toMatchObject(notFound)
  })
})
