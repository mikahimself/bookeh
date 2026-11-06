import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import * as gateway from '@/lib/payload/gateway'
import { otherEditions } from '@/lib/shelf/otherEditions'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { copyAs, sharedBook, unique } from '../helpers/builders'
import { contextFor, createUser } from '../helpers/harness'

// `otherEditions()` (FR-20): another Book of the same work the viewer has a
// copy of: same title after `editionTitle()`, a shared author by name. Names
// carry a per-run suffix, since the shared `nameKey` index is global.

describe('otherEditions', () => {
  let payload: Payload

  const sharedAuthor = async (by: User, name: string) =>
    payload.create({
      collection: 'authors',
      data: { name, visibility: 'shared', nameKey: '' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(by)).req,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('finds the owned hardcover for a paperback whose title adds a subtitle', async () => {
    const a = await createUser({ displayName: 'Editions Owner' })
    const author = await sharedAuthor(a, unique('Kytömäki'))
    const title = unique('Elolliset')
    const hardcover = await sharedBook({ by: a, title, authors: [author.id] })
    const copy = await copyAs(a, { book: hardcover.id })
    // An ordered copy counts too, one row per Book.
    const ordered = await sharedBook({ by: a, title, authors: [author.id] })
    const orderedCopy = await copyAs(a, { book: ordered.id, status: 'ordered' })

    const found = await otherEditions(await contextFor(a), {
      bookId: null,
      title: `${title} : romaani /`,
      authors: [author.name.toUpperCase()],
    })
    expect(found.map((row) => row.book.bookId)).toEqual([hardcover.id, ordered.id])
    expect(found.map((row) => row.mine.copies.map((line) => line.copyId))).toEqual([
      [copy.id],
      [orderedCopy.id],
    ])
    // Case and a trailing ` /` with no subtitle fold away too.
    const shouted = await otherEditions(await contextFor(a), {
      bookId: null,
      title: `${title.toUpperCase()} /`,
      authors: [author.name],
    })
    expect(shouted.map((row) => row.book.bookId)).toEqual([hardcover.id, ordered.id])

    // The Book asked for is never its own other edition.
    const others = await otherEditions(await contextFor(a), {
      bookId: hardcover.id,
      title,
      authors: [author.name],
    })
    expect(others.map((row) => row.book.bookId)).toEqual([ordered.id])
  })

  it('ignores the same title by another author', async () => {
    const a = await createUser({ displayName: 'Editions Author' })
    const y = await sharedAuthor(a, unique('Y'))
    const x = await sharedAuthor(a, unique('X'))
    const title = unique('Runot')
    const book = await sharedBook({ by: a, title, authors: [y.id] })
    await copyAs(a, { book: book.id })

    expect(
      await otherEditions(await contextFor(a), { bookId: null, title, authors: [x.name] }),
    ).toEqual([])
  })

  it('ignores another edition that is only on a wishlist', async () => {
    const a = await createUser({ displayName: 'Editions Wish' })
    const asA = await contextFor(a)
    const author = await sharedAuthor(a, unique('Kivi'))
    const title = unique('Nummisuutarit')
    const book = await sharedBook({ by: a, title, authors: [author.id] })
    const list = await gateway.create(asA, {
      collection: 'wishlists',
      data: { owner: a.id, name: unique('Toiveet'), nameKey: 'ignored' },
      depth: 0,
    })
    await gateway.create(asA, {
      collection: 'wishlist-entries',
      data: { owner: a.id, wishlist: list.id, book: book.id },
      depth: 0,
    })

    expect(await otherEditions(asA, { bookId: null, title, authors: [author.name] })).toEqual([])
  })
})
