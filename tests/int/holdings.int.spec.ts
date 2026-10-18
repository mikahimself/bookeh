import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Named } from '@/lib/books/effectiveBook'
import { getHoldings } from '@/lib/books/holdings'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, Copy, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `getHoldings()`, AD-9/AD-17: a viewer's own copies of a Book with their
// location names, seen by two users and the admin; every requested id is
// present; another user's copies never appear. Location names are unique per
// owner, so each carries a per-run suffix.

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

describe('getHoldings', () => {
  let payload: Payload
  let a: User
  let asA: Context
  let asB: Context
  let asAdmin: Context
  let x: Book
  let y: Book
  let p: Book
  let shelf: Named
  let ownedByA: Copy
  let orderedByA: Copy
  let ownedByB: Copy

  /** A system write, as `lib/catalogue` makes it, with `user` on the request. */
  const systemBook = async (user: User, visibility: Book['visibility']) =>
    payload.create({
      collection: 'books',
      data: { title: 'Tuntematon sotilas', isbn13: randomIsbn(), visibility },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  /** A location of A's through the gateway; `owner` and `nameKey` only satisfy the create type. */
  const locationOfA = async (): Promise<Named> => {
    const { id, name } = await gateway.create(asA, {
      collection: 'locations',
      data: { owner: a.id, name: unique('Hylly'), nameKey: 'ignored' },
      depth: 0,
    })
    return { id, name }
  }

  /** A copy created by `user` through the gateway; `owner` only satisfies the create type. */
  const copyAs = async (user: User, data: Partial<Copy> = {}) =>
    gateway.create(await contextFor(user), {
      collection: 'copies',
      data: { owner: user.id, book: x.id, status: 'owned', ...data },
      depth: 0,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Holdings User A' })
    const b = await createUser({ displayName: 'Holdings User B' })
    const admin = await createUser({ displayName: 'Holdings Admin', roles: ['admin'] })
    asA = await contextFor(a)
    asB = await contextFor(b)
    asAdmin = await contextFor(admin)

    x = await systemBook(a, 'shared')
    y = await systemBook(a, 'shared')
    p = await systemBook(a, 'private')

    shelf = await locationOfA()

    ownedByA = await copyAs(a, { location: shelf.id, notes: 'Signed' })
    // `notes: ''` as a form submits an empty field; read as no note.
    orderedByA = await copyAs(a, { status: 'ordered', notes: '' })
    ownedByB = await copyAs(b)
    await copyAs(a, { book: p.id })
  })

  it("lists the viewer's copies in creation order with their locations and notes", async () => {
    const seen = await getHoldings(asA, [x.id])
    expect(seen.get(x.id)).toEqual({
      copies: [
        { copyId: ownedByA.id, status: 'owned', location: shelf, note: 'Signed', loan: null },
        { copyId: orderedByA.id, status: 'ordered', location: null, note: null, loan: null },
      ],
      entries: [],
    })
  })

  it("never shows another user's copies", async () => {
    const byA = (await getHoldings(asA, [x.id])).get(x.id)?.copies.map((line) => line.copyId)
    const byB = (await getHoldings(asB, [x.id])).get(x.id)?.copies.map((line) => line.copyId)
    expect(byA).toEqual([ownedByA.id, orderedByA.id])
    expect(byB).toEqual([ownedByB.id])
  })

  it("reads no one else's copies as the admin", async () => {
    expect((await getHoldings(asAdmin, [x.id])).get(x.id)).toEqual({ copies: [], entries: [] })
  })

  it('maps a Book the viewer holds nothing of to empty holdings', async () => {
    expect((await getHoldings(asA, [y.id])).get(y.id)).toEqual({ copies: [], entries: [] })
  })

  it("keys an unreadable Book too, empty for the viewer who can't read it", async () => {
    const seen = await getHoldings(asB, [x.id, p.id])
    expect([...seen.keys()]).toEqual([x.id, p.id])
    expect(seen.get(p.id)).toEqual({ copies: [], entries: [] })
    expect((await getHoldings(asA, [p.id])).get(p.id)?.copies).toHaveLength(1)
  })

  it('returns every copy and every location, beyond one page, in creation order', async () => {
    const book = await systemBook(a, 'shared')
    const copyIds: number[] = []
    const locationIds: number[] = []
    for (let i = 0; i < 11; i++) {
      const location = await locationOfA()
      locationIds.push(location.id)
      copyIds.push((await copyAs(a, { book: book.id, location: location.id })).id)
    }
    const seen = (await getHoldings(asA, [book.id])).get(book.id)
    expect(seen?.copies.map((line) => line.copyId)).toEqual(copyIds)
    expect(seen?.copies.map((line) => line.location?.id)).toEqual(locationIds)
  })

  it('returns an empty map for no ids', async () => {
    expect(await getHoldings(asB, [])).toEqual(new Map())
  })
})
