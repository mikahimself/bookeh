import { randomInt } from 'node:crypto'

import { Forbidden, getPayload, NotFound, type Payload, ValidationError } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { toIsbn13 } from '@/fields/isbn'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'

// `books`, AD-4/AD-5/AD-19: read scoping, admin-only `rawMetadata`, refused
// user writes and the per-scope ISBN indexes. The shared index is global and
// test rows stay, so every ISBN is a fresh random one.

/** A random valid 978 ISBN-13. */
const randomIsbn = (): string => {
  const first12 = `978${String(randomInt(1e9)).padStart(9, '0')}`
  for (let digit = 0; digit < 10; digit++) {
    const isbn = toIsbn13(`${first12}${digit}`)
    if (isbn) return isbn
  }
  throw new Error('unreachable: one check digit always fits')
}

/** The ISBN-10 form of a 978 ISBN-13. */
const toIsbn10 = (isbn13: string): string => {
  const first9 = isbn13.slice(3, 12)
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i)
  const check = (11 - (sum % 11)) % 11
  return `${first9}${check === 10 ? 'X' : check}`
}

const hyphenated = (isbn13: string) =>
  `${isbn13.slice(0, 3)}-${isbn13.slice(3, 6)}-${isbn13.slice(6, 12)}-${isbn13.slice(12)}`

const rawMetadata: NonNullable<Book['rawMetadata']> = {
  v: 1,
  fetchedAt: '2026-10-13T00:00:00.000Z',
  sources: { finna: { records: [] } },
  subjects: { google: ['Fiction'] },
  coverUrl: null,
}

describe('books', () => {
  let payload: Payload
  let a: User
  let b: User
  let admin: User

  /** A system write (as `lib/catalogue` makes it) with `user` on the request. */
  const systemCreate = async (
    user: User,
    visibility: Book['visibility'],
    isbn13: string | null,
    extra: Partial<Book> = {},
  ) =>
    payload.create({
      collection: 'books',
      data: { title: 'Kalevala', isbn13, visibility, ...extra },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Books User A' })
    b = await createUser({ displayName: 'Books User B' })
    admin = await createUser({ displayName: 'Books Admin', roles: ['admin'] })
  })

  it('hides a private Book from another user and shows it to its creator and the admin', async () => {
    const own = await systemCreate(a, 'private', randomIsbn())
    const shared = await systemCreate(a, 'shared', randomIsbn())
    expect(own.createdBy).toBe(a.id)
    expect(shared.createdBy).toBeNull()
    const where = { id: { in: [own.id, shared.id] } }

    const asB = await contextFor(b)
    const seenByB = await gateway.find(asB, { collection: 'books', where })
    expect(seenByB.docs.map((doc) => doc.id)).toEqual([shared.id])
    await expect(gateway.findByID(asB, { collection: 'books', id: own.id })).rejects.toThrow(
      NotFound,
    )

    for (const user of [a, admin]) {
      const ctx = await contextFor(user)
      const seen = await gateway.find(ctx, { collection: 'books', where, sort: 'id' })
      expect(seen.docs.map((doc) => doc.id)).toEqual([own.id, shared.id])
    }
  })

  it('shows rawMetadata to the admin only', async () => {
    const shared = await systemCreate(a, 'shared', randomIsbn(), { rawMetadata })
    const own = await systemCreate(a, 'private', randomIsbn(), { rawMetadata })

    const readers = [
      [a, [shared.id, own.id]],
      [b, [shared.id]],
    ] as const
    for (const [user, ids] of readers) {
      const ctx = await contextFor(user)
      for (const id of ids) {
        const doc = await gateway.findByID(ctx, { collection: 'books', id })
        expect(doc).not.toHaveProperty('rawMetadata')
      }
    }

    const asAdmin = await contextFor(admin)
    for (const id of [shared.id, own.id]) {
      const doc = await gateway.findByID(asAdmin, { collection: 'books', id })
      expect(doc.rawMetadata).toEqual(rawMetadata)
    }
  })

  it('refuses every write by a user', async () => {
    const own = await systemCreate(a, 'private', randomIsbn())
    const ctx = await contextFor(a)
    for (const visibility of ['shared', 'private'] as const) {
      await expect(
        gateway.create(ctx, {
          collection: 'books',
          data: { title: 'Typed', isbn13: randomIsbn(), visibility },
        }),
      ).rejects.toThrow(Forbidden)
    }
    await expect(
      gateway.updateByID(ctx, { collection: 'books', id: own.id, data: { title: 'Hijacked' } }),
    ).rejects.toThrow(Forbidden)
    await expect(gateway.deleteByID(ctx, { collection: 'books', id: own.id })).rejects.toThrow(
      Forbidden,
    )
    const unchanged = await payload.findByID({ collection: 'books', id: own.id })
    expect(unchanged.title).toBe(own.title)
  })

  it('keeps one shared Book per ISBN, whatever form the ISBN is given in', async () => {
    const isbn = randomIsbn()
    await systemCreate(a, 'shared', isbn)
    for (const form of [toIsbn10(isbn), hyphenated(isbn)]) {
      await expect(systemCreate(b, 'shared', form)).rejects.toThrow(ValidationError)
    }
  })

  it('keeps one private Book per creator and ISBN, beside a shared one', async () => {
    const isbn = randomIsbn()
    await systemCreate(a, 'shared', isbn)
    await systemCreate(a, 'private', isbn)
    await systemCreate(b, 'private', isbn)
    await expect(systemCreate(a, 'private', toIsbn10(isbn))).rejects.toThrow(ValidationError)
  })

  it('saves any number of private Books without an ISBN', async () => {
    const first = await systemCreate(a, 'private', null)
    const second = await systemCreate(a, 'private', null)
    expect(first.isbn13).toBeNull()
    expect(second.isbn13).toBeNull()
  })
})
