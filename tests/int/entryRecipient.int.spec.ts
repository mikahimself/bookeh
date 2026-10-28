import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { createPerson } from '@/lib/people/people'
import { createEntry, removeEntry, setEntryRecipient } from '@/lib/wishlists/entries'
import { createWishlist } from '@/lib/wishlists/wishlists'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `setEntryRecipient()` and `removeEntry()`, FR-38/AD-18: the opened entry's
// "For" and Remove, on the user's own open entries only. Rows are checked per
// user: other files write in parallel.

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

describe('entry recipient and removal', () => {
  let payload: Payload

  const user = async () => {
    const created = await createUser({ displayName: 'Entry Recipient User' })
    return { user: created, ctx: await contextFor(created) }
  }

  const sharedBook = async () =>
    payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })

  const ownEntry = async (ctx: Context, bookId: number) => {
    const wishlist = await createWishlist(ctx, unique('Toiveet'))
    return (await createEntry(ctx, { wishlist, bookId })).data.entryId
  }

  const closeByHand = (ctx: Context, id: number) =>
    gateway.updateByID(ctx, {
      collection: 'wishlist-entries',
      id,
      data: { closedAt: '2026-10-01T08:00:00.000Z' },
      depth: 0,
    })

  /** `id → forPerson` of the user's entries. */
  const recipientsOf = async (u: User) =>
    Object.fromEntries(
      (
        await payload.find({
          collection: 'wishlist-entries',
          where: { owner: { equals: u.id } },
          overrideAccess: true,
          depth: 0,
          pagination: false,
        })
      ).docs.map((e) => [e.id, e.forPerson ?? null]),
    )

  const peopleOf = async (u: User) =>
    (
      await payload.find({
        collection: 'people',
        where: { owner: { equals: u.id } },
        overrideAccess: true,
        depth: 0,
        pagination: false,
      })
    ).docs.map((p) => ({ id: p.id, name: p.name }))

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  describe('setEntryRecipient', () => {
    it('sets, changes and clears the recipient by id', async () => {
      const a = await user()
      const x = await sharedBook()
      const entry = await ownEntry(a.ctx, x.id)
      const other = await ownEntry(a.ctx, x.id)
      const p = await createPerson(a.ctx, 'Liisa')
      const q = await createPerson(a.ctx, 'Pekka')

      await expect(setEntryRecipient(a.ctx, entry, p)).resolves.toBe(p)
      expect(await recipientsOf(a.user)).toEqual({ [entry]: p, [other]: null })

      await expect(setEntryRecipient(a.ctx, entry, q)).resolves.toBe(q)
      expect(await recipientsOf(a.user)).toEqual({ [entry]: q, [other]: null })

      await expect(setEntryRecipient(a.ctx, entry, null)).resolves.toBeNull()
      expect(await recipientsOf(a.user)).toEqual({ [entry]: null, [other]: null })
    })

    it('creates a Person for a new inline name', async () => {
      const a = await user()
      const entry = await ownEntry(a.ctx, (await sharedBook()).id)

      const id = await setEntryRecipient(a.ctx, entry, { create: 'Liisa' })

      expect(await peopleOf(a.user)).toEqual([{ id, name: 'Liisa' }])
      expect(await recipientsOf(a.user)).toEqual({ [entry]: id })
    })

    it('reuses the Person an inline name matches by nameKey', async () => {
      const a = await user()
      const entry = await ownEntry(a.ctx, (await sharedBook()).id)
      const liisa = await createPerson(a.ctx, 'Liisa')

      await expect(setEntryRecipient(a.ctx, entry, { create: ' liisa ' })).resolves.toBe(liisa)

      expect(await peopleOf(a.user)).toEqual([{ id: liisa, name: 'Liisa' }])
      expect(await recipientsOf(a.user)).toEqual({ [entry]: liisa })
    })

    it('fails with VALIDATION on person for a foreign Person or a blank name, changing nothing', async () => {
      const a = await user()
      const b = await user()
      const entry = await ownEntry(a.ctx, (await sharedBook()).id)
      const p = await createPerson(a.ctx, 'Liisa')
      await setEntryRecipient(a.ctx, entry, p)
      const foreign = await createPerson(b.ctx, 'Pekka')

      for (const ref of [foreign, { create: '  ' }]) {
        await expect(setEntryRecipient(a.ctx, entry, ref)).rejects.toMatchObject({
          code: 'VALIDATION',
          fields: { person: 'VALIDATION' },
        })
      }

      expect(await recipientsOf(a.user)).toEqual({ [entry]: p })
      expect(await peopleOf(a.user)).toEqual([{ id: p, name: 'Liisa' }])
    })

    it('fails with NOT_FOUND for a closed, a foreign or a non-row id, creating no Person', async () => {
      const a = await user()
      const b = await user()
      const x = await sharedBook()
      const closed = await ownEntry(a.ctx, x.id)
      await closeByHand(a.ctx, closed)
      const foreign = await ownEntry(b.ctx, x.id)

      const open = await ownEntry(a.ctx, x.id)
      const admin = await createUser({ displayName: 'Entry Admin', roles: ['admin'] })

      for (const id of [closed, foreign, 0, 2147483647]) {
        await expect(setEntryRecipient(a.ctx, id, { create: 'Uusi' })).rejects.toMatchObject({
          code: 'NOT_FOUND',
        })
      }
      // FR-48: the admin is held to their own entries.
      await expect(
        setEntryRecipient(await contextFor(admin), open, { create: 'Uusi' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })

      expect(await peopleOf(a.user)).toEqual([])
      expect(await peopleOf(b.user)).toEqual([])
      expect(await peopleOf(admin)).toEqual([])
      expect(await recipientsOf(a.user)).toEqual({ [closed]: null, [open]: null })
      expect(await recipientsOf(b.user)).toEqual({ [foreign]: null })
    })
  })

  describe('removeEntry', () => {
    it('deletes only that entry', async () => {
      const a = await user()
      const x = await sharedBook()
      const entry = await ownEntry(a.ctx, x.id)
      const other = await ownEntry(a.ctx, x.id)

      await expect(removeEntry(a.ctx, entry)).resolves.toBeUndefined()

      expect(await recipientsOf(a.user)).toEqual({ [other]: null })
    })

    it('fails with NOT_FOUND for a closed, a foreign or a non-row id, deleting nothing', async () => {
      const a = await user()
      const b = await user()
      const x = await sharedBook()
      const closed = await ownEntry(a.ctx, x.id)
      await closeByHand(a.ctx, closed)
      const foreign = await ownEntry(b.ctx, x.id)

      const open = await ownEntry(a.ctx, x.id)
      const admin = await createUser({ displayName: 'Entry Admin', roles: ['admin'] })

      for (const id of [closed, foreign, 0, 2147483647]) {
        await expect(removeEntry(a.ctx, id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
      }
      // FR-48: the admin is held to their own entries.
      await expect(removeEntry(await contextFor(admin), open)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })

      expect(await recipientsOf(a.user)).toEqual({ [closed]: null, [open]: null })
      expect(await recipientsOf(b.user)).toEqual({ [foreign]: null })
    })
  })
})
