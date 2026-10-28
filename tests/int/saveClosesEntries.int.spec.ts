import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { type CopySaveInput, saveCopy } from '@/lib/catalogue/saveCopy'
import { createCopy } from '@/lib/copies/createCopy'
import { logger } from '@/lib/errors'
import { lendCopy } from '@/lib/loans/loans'
import { heldOutcome, lookupSources } from '@/lib/metadata/lookup'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { undo } from '@/lib/undo/undo'
import { createEntry } from '@/lib/wishlists/entries'
import { createWishlist } from '@/lib/wishlists/wishlists'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `saveCopy()`, FR-28/AD-18: Add to library closes the user's own open
// entries for the saved Book in the save's transaction, and its Undo reopens
// them. Every Book here is shared and held, so no source is asked. Rows are
// checked per user: other files write in parallel.

vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn(), heldOutcome: vi.fn() }))
// The real `createCopy()`, made to fail once by the rollback test.
vi.mock('@/lib/copies/createCopy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/copies/createCopy')>()
  return { ...actual, createCopy: vi.fn(actual.createCopy) }
})

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

const copyInput = (target: CopySaveInput['target']): CopySaveInput => ({
  requestId: randomUUID(),
  target,
  save: { kind: 'copy' },
})

describe('saveCopy closes matching wishes', () => {
  let payload: Payload

  const freshUser = async () => {
    const user = await createUser({ displayName: 'Closes Entries User' })
    return { user, ctx: await contextFor(user) }
  }

  const sharedBook = async () =>
    payload.create({
      collection: 'books',
      data: { title: 'Tuntematon sotilas', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })

  const ownEntry = async (ctx: Context, wishlist: number, bookId: number) =>
    (await createEntry(ctx, { wishlist, bookId })).data.entryId

  /** An entry for a new Person, through the gateway: no service sets a recipient yet. */
  const entryForPerson = async (ctx: Context, wishlist: number, book: number) => {
    const person = await gateway.create(ctx, {
      collection: 'people',
      data: { owner: ctx.user.id, name: unique('Liisa'), nameKey: 'ignored' },
      depth: 0,
    })
    const entry = await gateway.create(ctx, {
      collection: 'wishlist-entries',
      data: { owner: ctx.user.id, wishlist, book, forPerson: person.id },
      depth: 0,
    })
    return entry.id
  }

  /** `id → closedAt` of the user's entries. */
  const closedAtOf = async (user: User) =>
    Object.fromEntries(
      (
        await payload.find({
          collection: 'wishlist-entries',
          where: { owner: { equals: user.id } },
          overrideAccess: true,
          depth: 0,
          pagination: false,
        })
      ).docs.map((e) => [e.id, e.closedAt ?? null]),
    )

  const copyIds = async (user: User) =>
    (
      await payload.find({
        collection: 'copies',
        where: { owner: { equals: user.id } },
        overrideAccess: true,
        depth: 0,
        pagination: false,
      })
    ).docs.map((c) => c.id)

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(() => {
    vi.mocked(lookupSources).mockReset()
    vi.mocked(heldOutcome).mockReset()
  })

  afterEach(() => {
    expect(lookupSources).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  /** Matrix rows Closes own and Leaves others: A's state before an `{ isbn13 }` save of X. */
  const scene = async () => {
    const a = await freshUser()
    const b = await freshUser()
    const x = await sharedBook()
    const y = await sharedBook()
    const l1 = await createWishlist(a.ctx, unique('L1'))
    const l2 = await createWishlist(a.ctx, unique('L2'))
    const own1 = await ownEntry(a.ctx, l1, x.id)
    const own2 = await ownEntry(a.ctx, l2, x.id)
    const forP = await entryForPerson(a.ctx, l1, x.id)
    const closed = await ownEntry(a.ctx, l1, x.id)
    const t0 = '2026-10-01T08:00:00.000Z'
    await gateway.updateByID(a.ctx, {
      collection: 'wishlist-entries',
      id: closed,
      data: { closedAt: t0 },
      depth: 0,
    })
    const onY = await ownEntry(a.ctx, l1, y.id)
    const ofB = await ownEntry(b.ctx, await createWishlist(b.ctx, unique('B')), x.id)
    return { a, b, x, own1, own2, forP, closed, t0, onY, ofB }
  }

  it('closes only my open own entries for the Book', async () => {
    const s = await scene()

    const result = await saveCopy(s.a.ctx, copyInput({ isbn13: s.x.isbn13! }))

    expect(await copyIds(s.a.user)).toEqual([result.copyId])
    const after = await closedAtOf(s.a.user)
    expect(after[s.own1]).toEqual(expect.any(String))
    expect(after[s.own2]).toBe(after[s.own1])
    expect(after[s.forP]).toBeNull()
    expect(after[s.closed]).toBe(s.t0)
    expect(after[s.onY]).toBeNull()
    expect((await closedAtOf(s.b.user))[s.ofB]).toBeNull()
  })

  it('closes an entry for a Book saved by id, held only through that entry', async () => {
    const { user, ctx } = await freshUser()
    const x = await sharedBook()
    const entry = await ownEntry(ctx, await createWishlist(ctx, unique('Toiveet')), x.id)

    const result = await saveCopy(ctx, copyInput({ bookId: x.id }))

    expect(await copyIds(user)).toEqual([result.copyId])
    expect((await closedAtOf(user))[entry]).toEqual(expect.any(String))
  })

  // AD-16: the close is in the save's transaction, so a failed save leaves it open.
  it('leaves the entry open when the copy fails after the close', async () => {
    const { user, ctx } = await freshUser()
    const x = await sharedBook()
    const entry = await ownEntry(ctx, await createWishlist(ctx, unique('Kesken')), x.id)
    let closedInSave: unknown
    vi.mocked(createCopy).mockImplementationOnce(async (tx) => {
      closedInSave = (
        await gateway.findByID(tx, { collection: 'wishlist-entries', id: entry, depth: 0 })
      ).closedAt
      throw new Error('copy failed')
    })

    await expect(saveCopy(ctx, copyInput({ bookId: x.id }))).rejects.toThrow('copy failed')

    expect(closedInSave).toEqual(expect.any(String))
    expect(await closedAtOf(user)).toEqual({ [entry]: null })
    expect(await copyIds(user)).toEqual([])
  })

  describe('undo', () => {
    it('deletes the copy and reopens only the entries the save closed', async () => {
      const s = await scene()
      const before = await closedAtOf(s.a.user)

      const result = await saveCopy(s.a.ctx, copyInput({ isbn13: s.x.isbn13! }))
      await undo(s.a.ctx, result.undoToken)

      expect(await copyIds(s.a.user)).toEqual([])
      expect(await closedAtOf(s.a.user)).toEqual(before)
      expect((await closedAtOf(s.b.user))[s.ofB]).toBeNull()
    })

    // AD-20: a restore skips rows that are gone.
    it('succeeds once a closed entry is gone, deleting the copy', async () => {
      const { user, ctx } = await freshUser()
      const x = await sharedBook()
      const list = await createWishlist(ctx, unique('Poistuva'))
      const gone = await ownEntry(ctx, list, x.id)
      const kept = await ownEntry(ctx, list, x.id)

      const result = await saveCopy(ctx, copyInput({ isbn13: x.isbn13! }))
      await gateway.deleteByID(ctx, { collection: 'wishlist-entries', id: gone, depth: 0 })

      await expect(undo(ctx, result.undoToken)).resolves.toBeUndefined()

      expect(await copyIds(user)).toEqual([])
      expect(await closedAtOf(user)).toEqual({ [kept]: null })
    })

    it('fails with UNDO_FAILED once the copy is lent, keeping the entries closed', async () => {
      const { user, ctx } = await freshUser()
      const x = await sharedBook()
      const entry = await ownEntry(ctx, await createWishlist(ctx, unique('Lainattu')), x.id)

      const result = await saveCopy(ctx, copyInput({ isbn13: x.isbn13! }))
      await lendCopy(ctx, result.copyId, { create: 'Liisa' })
      const closedAt = (await closedAtOf(user))[entry]
      vi.spyOn(logger(), 'warn').mockImplementation(() => {})

      await expect(undo(ctx, result.undoToken)).rejects.toMatchObject({ code: 'UNDO_FAILED' })

      expect(await copyIds(user)).toEqual([result.copyId])
      expect(closedAt).toEqual(expect.any(String))
      expect((await closedAtOf(user))[entry]).toBe(closedAt)
    })
  })
})
