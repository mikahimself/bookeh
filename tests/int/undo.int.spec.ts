import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { DomainError, logger } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { withTransaction } from '@/lib/payload/transaction'
import { RECEIPT_STORE_SIZE, RECEIPT_TTL_MS, type Restore, undo, withUndo } from '@/lib/undo/undo'
import config from '@/payload.config'

import { contextFor, createUser } from '../helpers/harness'

// AD-20: the receipt mechanism itself, with a fake undoable function over A's
// `locations` rows. Real undoable services test their own restore.
describe('undo receipts', () => {
  let payload: Payload
  let ctxA: Context
  let ctxB: Context

  beforeAll(async () => {
    payload = await getPayload({ config })
    ctxA = await contextFor(await createUser({ displayName: 'Undo User A' }))
    ctxB = await contextFor(await createUser({ displayName: 'Undo User B' }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const undoFailed = { name: 'DomainError', code: 'UNDO_FAILED' }

  /** A's location created in `tx`; `owner` and `nameKey` only satisfy the create type. */
  const createLocation = (tx: Context, name = `Hylly ${randomUUID()}`) =>
    gateway.create(tx, {
      collection: 'locations',
      data: { owner: ctxA.user.id, name, nameKey: 'ignored' },
      depth: 0,
    })

  /** Reads past access: whether the row is there. */
  const exists = async (id: number) =>
    (await payload.count({ collection: 'locations', where: { id: { equals: id } } })).totalDocs ===
    1
  const storedName = async (id: number) =>
    (await payload.findByID({ collection: 'locations', id, depth: 0 })).name

  /** The fake undoable function: creates a location of A's, restore deletes it. */
  const createUndoable = (restore: (id: number) => Restore) => async (tx: Context) => {
    const { id } = await createLocation(tx)
    return { data: { id }, restore: restore(id) }
  }
  const deleting =
    (id: number): Restore =>
    async (tx) => {
      await gateway.deleteByID(tx, { collection: 'locations', id })
    }

  it('records a receipt after the commit and undoes it once in a transaction', async () => {
    const seen: Context[] = []
    const result = await withUndo(
      ctxA,
      createUndoable((id) => async (tx) => {
        seen.push(tx)
        await deleting(id)(tx)
      }),
    )
    expect(result).toEqual({
      id: expect.any(Number),
      undoToken: expect.any(String),
      undoSeconds: 1800,
    })
    expect(await exists(result.id)).toBe(true)

    await undo(ctxA, result.undoToken)
    expect(seen).toHaveLength(1)
    expect(seen[0].transactionID).toBeDefined()
    expect(seen[0].user.id).toBe(ctxA.user.id)
    expect(await exists(result.id)).toBe(false)

    // Used: the token is spent whatever happens next.
    await expect(undo(ctxA, result.undoToken)).rejects.toMatchObject(undoFailed)
    expect(seen).toHaveLength(1)
  })

  it('records nothing and rethrows when fn throws', async () => {
    const e = new Error('boom')
    let id: number | undefined
    await expect(
      withUndo(ctxA, async (tx) => {
        id = (await createLocation(tx)).id
        throw e
      }),
    ).rejects.toBe(e)
    expect(id).toBeDefined()
    expect(await exists(id!)).toBe(false)
  })

  it("refuses another user's token and leaves the receipt for its owner", async () => {
    const restore = vi.fn(async () => {})
    const { undoToken } = await withUndo(ctxA, async () => ({ data: {}, restore }))
    await expect(undo(ctxB, undoToken)).rejects.toMatchObject(undoFailed)
    expect(restore).not.toHaveBeenCalled()
    await undo(ctxA, undoToken)
    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('refuses an expired token and forgets it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = Date.now()
    vi.setSystemTime(now)
    const restore = vi.fn(async () => {})
    const { undoToken } = await withUndo(ctxA, async () => ({ data: {}, restore }))

    vi.setSystemTime(now + RECEIPT_TTL_MS)
    await expect(undo(ctxA, undoToken)).rejects.toMatchObject(undoFailed)
    expect(restore).not.toHaveBeenCalled()

    // Gone, not merely expired: back in time it still fails.
    vi.setSystemTime(now)
    await expect(undo(ctxA, undoToken)).rejects.toMatchObject(undoFailed)
    expect(restore).not.toHaveBeenCalled()
  })

  it('refuses a token it never issued', async () => {
    await expect(undo(ctxA, randomUUID())).rejects.toMatchObject(undoFailed)
  })

  it('rolls back a failed restore, logs the cause and spends the token', async () => {
    const warn = vi.spyOn(logger(), 'warn').mockImplementation(() => logger())
    const cause = new Error('restore broke')
    const { id, undoToken } = await withUndo(
      ctxA,
      createUndoable((id) => async (tx) => {
        await gateway.updateByID(tx, { collection: 'locations', id, data: { name: 'Renamed' } })
        throw cause
      }),
    )
    const before = await storedName(id)

    await expect(undo(ctxA, undoToken)).rejects.toMatchObject(undoFailed)
    expect(await storedName(id)).toBe(before)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatchObject({ err: cause })
    expect(JSON.stringify(warn.mock.calls)).not.toContain(undoToken)

    await expect(undo(ctxA, undoToken)).rejects.toMatchObject(undoFailed)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('evicts the oldest receipt past RECEIPT_STORE_SIZE', { timeout: 20_000 }, async () => {
    const restore = vi.fn(async () => {})
    const tokens: string[] = []
    for (let i = 0; i < RECEIPT_STORE_SIZE + 1; i++) {
      tokens.push((await withUndo(ctxA, async () => ({ data: {}, restore }))).undoToken)
    }
    await expect(undo(ctxA, tokens[0])).rejects.toMatchObject(undoFailed)
    expect(restore).not.toHaveBeenCalled()
    await undo(ctxA, tokens[1])
    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('refuses to record inside a transaction', async () => {
    const fn = vi.fn(async () => ({ data: {}, restore: async () => {} }))
    const err = await withTransaction(ctxA, (tx) => withUndo(tx, fn)).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(DomainError)
    expect(fn).not.toHaveBeenCalled()
  })
})
