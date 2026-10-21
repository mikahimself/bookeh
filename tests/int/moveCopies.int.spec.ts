import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { moveCopies } from '@/lib/copies/moveCopies'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { undo, withUndo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { Book, Copy, User, UserLocation } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `moveCopies()`, AD-18/AD-20/FR-33: one move of the viewer's selection to
// one location, all or none, undoable through `withUndo()`. Each case uses a
// fresh user so location names never collide.

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
    expect(result.location).toBe(cabin)
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

    const { undoToken } = await withUndo(asA, (tx) => moveCopies(tx, [c1.id, c2.id], l2.id))
    const { data } = await moveCopies(asA, [c2.id], null)
    expect(data.location).toBeNull()
    expect(await locationOf(c2.id)).toBeNull()
    await payload.delete({ collection: 'copies', id: c1.id })

    await expect(undo(asA, undoToken)).resolves.toBeUndefined()
    expect(await locationOf(c2.id)).toBeNull()
  })

  it('moves nothing and creates no location when the list holds an ordered copy', async () => {
    const a = await createUser({ displayName: 'Move Copies Ordered' })
    const asA = await contextFor(a)
    const home = await locationFor(a, 'Olohuone')
    const owned = await copyFor(a, 'owned', home.id)
    const ordered = await copyFor(a, 'ordered')

    const err = await failure(moveCopies(asA, [owned.id, ordered.id], { create: 'Mökki' }))
    expect(err).toBeInstanceOf(DomainError)
    expect(err).toMatchObject({ code: 'VALIDATION', fields: { location: 'VALIDATION' } })
    expect(await failure(moveCopies(asA, [owned.id, ordered.id], null))).toMatchObject({
      code: 'VALIDATION',
      fields: { location: 'VALIDATION' },
    })
    expect(await locationOf(owned.id)).toBe(home.id)
    expect(await locationOf(ordered.id)).toBeNull()
    expect(await locationsOf(a)).toBe(1)
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
