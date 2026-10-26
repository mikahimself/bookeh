import { getPayload, NotFound, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { createCopy } from '@/lib/copies/createCopy'
import { removeCopies } from '@/lib/copies/removeCopies'
import { setNote, setStatus } from '@/lib/copies/updateCopy'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import config from '@/payload.config'
import type { Book, User, UserLocation } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// AD-18: `setStatus`, `setNote` and `removeCopies` write only the viewer's
// copies (an explicit `owner` filter, FR-48) and fail with NOT_FOUND, writing
// nothing, on any other id. Status reuses `createCopy`'s location rule (AD-8):
// ordered clears it, owned lands at the default unless one is given.
// `removeCopies` deletes the owned copies in one transaction, skips ordered
// ones and refuses the whole list when one id is not the viewer's.

describe('copy writes', () => {
  let payload: Payload
  let a: User
  let b: User
  let asA: Context
  let asB: Context
  let home: UserLocation
  let book: Book

  const systemRead = (id: number) => payload.findByID({ collection: 'copies', id, depth: 0 })

  const newLocation = async (user: User, name: string): Promise<UserLocation> =>
    payload.create({
      collection: 'locations',
      data: { owner: user.id, name, nameKey: '' },
      overrideAccess: false,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const copyOf = async (ctx: Context) =>
    (await createCopy(ctx, { bookId: book.id, status: 'owned' })).data

  const notFound = new DomainError('NOT_FOUND')

  beforeAll(async () => {
    payload = await getPayload({ config })
    const user = await createUser({ displayName: 'Copy Writes User A' })
    home = await newLocation(user, 'Olohuone')
    a = await payload.update({
      collection: 'users',
      id: user.id,
      data: { defaultLocation: home.id },
      overrideAccess: true,
    })
    b = await createUser({ displayName: 'Copy Writes User B' })
    asA = await contextFor(a)
    asB = await contextFor(b)
    book = await payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })
  })

  it('clears the location on ordered and places owned at the default or the given one', async () => {
    const shelf = await newLocation(a, 'Työhuone')
    const { data: id } = await createCopy(asA, {
      bookId: book.id,
      status: 'owned',
      location: shelf.id,
    })

    await setStatus(asA, id, { status: 'ordered' })
    const ordered = await systemRead(id)
    expect(ordered.status).toBe('ordered')
    expect(ordered.location ?? null).toBeNull()

    await setStatus(asA, id, { status: 'owned' })
    expect(await systemRead(id)).toMatchObject({ status: 'owned', location: home.id })

    await setStatus(asA, id, { status: 'owned', location: { create: 'Mökki' } })
    const { docs } = await payload.find({
      collection: 'locations',
      where: { and: [{ owner: { equals: a.id } }, { name: { equals: 'Mökki' } }] },
      depth: 0,
    })
    expect(docs).toHaveLength(1)
    expect((await systemRead(id)).location).toBe(docs[0]?.id)

    await setStatus(asA, id, { status: 'owned', location: null })
    expect((await systemRead(id)).location ?? null).toBeNull()
  })

  it('stores the note trimmed and NFC-normalised, and an empty one as null', async () => {
    const id = await copyOf(asA)
    await setNote(asA, id, '  Cafe\u0301  ')
    expect((await systemRead(id)).notes).toBe('Caf\u00e9')
    await setNote(asA, id, '   ')
    expect((await systemRead(id)).notes ?? null).toBeNull()
  })

  it('removes the listed owned copies, skips an ordered one and keeps the Book', async () => {
    const first = await copyOf(asA)
    const second = await copyOf(asA)
    const ordered = await copyOf(asA)
    await setStatus(asA, ordered, { status: 'ordered' })
    await expect(removeCopies(asA, [])).resolves.toEqual({ removed: 0, skipped: [] })
    expect(await removeCopies(asA, [first, second, first, ordered])).toEqual({
      removed: 2,
      skipped: [ordered],
    })
    await expect(systemRead(first)).rejects.toThrow(NotFound)
    await expect(systemRead(second)).rejects.toThrow(NotFound)
    expect((await systemRead(ordered)).status).toBe('ordered')
    expect((await payload.findByID({ collection: 'books', id: book.id, depth: 0 })).id).toBe(
      book.id,
    )
  })

  it("removes none when one id is another user's", async () => {
    const mine = await copyOf(asA)
    const theirs = await copyOf(asB)
    await expect(removeCopies(asA, [mine, theirs])).rejects.toMatchObject(notFound)
    expect((await systemRead(mine)).id).toBe(mine)
    expect((await systemRead(theirs)).id).toBe(theirs)
  })

  it("refuses another user's copy on setStatus and setNote and leaves it unchanged", async () => {
    const theirs = await copyOf(asB)
    await setNote(asB, theirs, 'Lainassa')
    const before = await systemRead(theirs)
    await expect(setStatus(asA, theirs, { status: 'ordered' })).rejects.toMatchObject(notFound)
    await expect(setNote(asA, theirs, 'Minun')).rejects.toMatchObject(notFound)
    expect(await systemRead(theirs)).toMatchObject({
      status: 'owned',
      notes: 'Lainassa',
      updatedAt: before.updatedAt,
    })
  })
})
