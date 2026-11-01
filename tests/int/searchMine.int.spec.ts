import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { upsertUserBook } from '@/lib/books/upsertUserBook'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { MINE_SEARCH_LIMIT, searchMine } from '@/lib/shelf/searchMine'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { copyAs, sharedBook, unique } from '../helpers/builders'
import { contextFor, createUser } from '../helpers/harness'

// `searchMine()` (FR-20, AD-7): the viewer's copies and open wishlist entries
// matched on effective title, author and series, one row per Book, in the
// shelf's author order. Each test has its own users; owner scoping keeps them
// apart, and the shared `nameKey` index is global, so names carry a per-run
// suffix. Each test also searches a token of its own, so other tests' rows
// cannot match.

describe('searchMine', () => {
  let payload: Payload

  /** A shared author or series. `sortName` is given where the order matters: a
   * derived one would start with the per-run name suffix. */
  const sharedRecord = async (
    by: User,
    collection: 'authors' | 'series',
    name: string,
    sortName?: string,
  ) =>
    (
      await payload.create({
        collection,
        data: {
          name: unique(name),
          visibility: 'shared',
          nameKey: '',
          ...(sortName && { sortName }),
        },
        overrideAccess: true,
        depth: 0,
        req: (await contextFor(by)).req,
      })
    ).id

  /** An open entry of `user`'s on `book`, on a list of theirs. */
  const entryOn = async (user: User, book: Book, closed?: boolean) => {
    const list = await gateway.create(await contextFor(user), {
      collection: 'wishlists',
      data: { owner: user.id, name: unique('Toiveet'), nameKey: 'ignored' },
      depth: 0,
    })
    return gateway.create(await contextFor(user), {
      collection: 'wishlist-entries',
      data: {
        owner: user.id,
        wishlist: list.id,
        book: book.id,
        ...(closed && { closedAt: new Date().toISOString() }),
      },
      depth: 0,
    })
  }

  const bookIds = async (ctx: Context, text: string) =>
    (await searchMine(ctx, text)).map((row) => row.book.bookId)

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('finds a copy, an entry-only Book and one held both ways, by title, author and series', async () => {
    const token = randomUUID().slice(0, 8)
    const a = await createUser({ displayName: 'Mine Fields' })
    const asA = await contextFor(a)
    const kivi = await sharedRecord(a, 'authors', `Kivi ${token}`)
    const muumit = await sharedRecord(a, 'series', `Muumit ${token}`)

    const byTitle = await sharedBook({ by: a, title: `Seitsemän veljestä ${token}` })
    const copy = await copyAs(a, { book: byTitle.id })
    const byAuthor = await sharedBook({ by: a, title: 'Kirja', authors: [kivi] })
    const entry = await entryOn(a, byAuthor)
    const bySeries = await sharedBook({ by: a, title: 'Kirja', authors: [kivi], series: muumit })
    const bothCopy = await copyAs(a, { book: bySeries.id })
    const bothEntry = await entryOn(a, bySeries)

    const found = await searchMine(asA, token)
    expect(found.map((row) => row.book.bookId).sort()).toEqual(
      [byTitle.id, byAuthor.id, bySeries.id].sort(),
    )

    const mineOf = (bookId: number) => found.find((row) => row.book.bookId === bookId)!.mine
    expect(mineOf(byTitle.id).copies.map((line) => line.copyId)).toEqual([copy.id])
    expect(mineOf(byTitle.id).entries).toEqual([])
    expect(mineOf(byAuthor.id).copies).toEqual([])
    expect(mineOf(byAuthor.id).entries.map((line) => line.entryId)).toEqual([entry.id])
    // Held both ways is one row carrying both lines.
    expect(mineOf(bySeries.id).copies.map((line) => line.copyId)).toEqual([bothCopy.id])
    expect(mineOf(bySeries.id).entries.map((line) => line.entryId)).toEqual([bothEntry.id])

    // Case-insensitive substring, never accent-folded.
    expect(await bookIds(asA, 'VELJES')).toEqual([byTitle.id])
    expect(await bookIds(asA, 'veljesta')).toEqual([])
    expect(await bookIds(asA, '   ')).toEqual([])
    expect(await bookIds(asA, `${token} ei löydy`)).toEqual([])
  })

  it('ignores a closed entry', async () => {
    const token = randomUUID().slice(0, 8)
    const a = await createUser({ displayName: 'Mine Closed' })
    const asA = await contextFor(a)
    const open = await sharedBook({ by: a, title: `Avoin ${token}` })
    const closed = await sharedBook({ by: a, title: `Suljettu ${token}` })
    await entryOn(a, open)
    await entryOn(a, closed, true)

    expect(await bookIds(asA, token)).toEqual([open.id])
  })

  it('searches the viewer’s own values, not the Book’s', async () => {
    const token = randomUUID().slice(0, 8)
    const a = await createUser({ displayName: 'Mine Overrides' })
    const asA = await contextFor(a)
    const book = await sharedBook({ by: a, title: `Vanha ${token}` })
    await copyAs(a, { book: book.id })
    await upsertUserBook(asA, book.id, { overrides: { title: `Uusi ${token}` } })

    expect(await bookIds(asA, `Vanha ${token}`)).toEqual([])
    expect(await bookIds(asA, `Uusi ${token}`)).toEqual([book.id])
  })

  it('never shows another user’s copies, entries or private Books', async () => {
    const token = randomUUID().slice(0, 8)
    const a = await createUser({ displayName: 'Mine A' })
    const b = await createUser({ displayName: 'Mine B' })
    const asA = await contextFor(a)
    const asB = await contextFor(b)
    const copied = await sharedBook({ by: b, title: `Bn kopio ${token}` })
    const wished = await sharedBook({ by: b, title: `Bn toive ${token}` })
    const secret = await sharedBook({ by: b, title: `Bn salainen ${token}`, visibility: 'private' })
    await copyAs(b, { book: copied.id })
    await entryOn(b, wished)
    await copyAs(b, { book: secret.id })

    expect(await bookIds(asA, token)).toEqual([])
    expect((await bookIds(asB, token)).sort()).toEqual([copied.id, wished.id, secret.id].sort())
  })

  it('orders by author sort name, nulls last, then title, and caps the result', async () => {
    const token = randomUUID().slice(0, 8)
    const a = await createUser({ displayName: 'Mine Order' })
    const asA = await contextFor(a)
    const aho = await sharedRecord(a, 'authors', `Aho ${token}`, `Aho, ${token}`)
    const kivi = await sharedRecord(a, 'authors', `Kivi ${token}`, `Kivi, ${token}`)
    const first = await sharedBook({ by: a, title: `B ${token}`, authors: [aho] })
    const second = await sharedBook({ by: a, title: `A ${token}`, authors: [kivi] })
    const noAuthorB = await sharedBook({ by: a, title: `B ${token}` })
    const noAuthorA = await sharedBook({ by: a, title: `A ${token}` })
    for (const book of [noAuthorB, second, noAuthorA, first]) await copyAs(a, { book: book.id })

    expect(await bookIds(asA, token)).toEqual([first.id, second.id, noAuthorA.id, noAuthorB.id])
  })

  it('returns at most MINE_SEARCH_LIMIT Books', async () => {
    const token = randomUUID().slice(0, 8)
    const a = await createUser({ displayName: 'Mine Cap' })
    const asA = await contextFor(a)
    for (let i = 0; i <= MINE_SEARCH_LIMIT; i++) {
      const book = await sharedBook({ by: a, title: `${token} ${String(i).padStart(2, '0')}` })
      await copyAs(a, { book: book.id })
    }

    expect(await bookIds(asA, token)).toHaveLength(MINE_SEARCH_LIMIT)
  })
})
