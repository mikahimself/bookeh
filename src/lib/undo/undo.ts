import { randomUUID } from 'node:crypto'

import { DomainError, logger } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { withTransaction } from '@/lib/payload/transaction'
import { processState } from '@/lib/processState'

// Spine, AD-20: Undo is one mechanism. Receipts are held here, in process
// (AD-12), keyed by an opaque token the client carries; the browser never
// holds previous values. `withUndo()` is the only recorder and `undo()` the
// only entry point.

/** Spine, Structural Seed (`src/lib/undo`): what a restore does, in the transaction `undo()` opens. */
export type Restore = (ctx: Context) => Promise<void>
/** Returned by an undoable service function: its result and the restore over ids and previous values. */
export type Undone<T> = { data: T; restore: Restore }
/** Returned by `withUndo()`: the result with its token and the whole seconds left on it. */
export type Undoable<T> = T & { undoToken: string; undoSeconds: number }

/** AD-20: a receipt lives 30 minutes. */
export const RECEIPT_TTL_MS = 30 * 60_000
/** AD-12: the store is bounded; the oldest receipts go first. */
export const RECEIPT_STORE_SIZE = 500

type Receipt = { userId: number; restore: Restore; expiresAt: number }

// Insertion order is age: the first key is the oldest receipt.
const receipts = () => processState('undo.receipts', () => new Map<string, Receipt>())

function record(receipt: Receipt, now: number): string {
  const store = receipts()
  for (const [token, { expiresAt }] of store) {
    if (expiresAt <= now) store.delete(token)
  }
  for (const oldest of store.keys()) {
    if (store.size < RECEIPT_STORE_SIZE) break
    store.delete(oldest)
  }
  const token = randomUUID()
  store.set(token, receipt)
  return token
}

/**
 * AD-20 and AD-16: the only recorder. Runs `fn` in the transaction it opens
 * with `withTransaction()`, records the restore after the commit and returns
 * the result with its `undoToken` and the seconds remaining on it. When `fn`
 * throws, nothing is recorded and the error is rethrown unchanged.
 *
 * Refuses a context that already carries a transaction: the receipt would be
 * recorded before that transaction commits. A service that calls another
 * service's undoable function folds its restore into its own instead.
 */
export async function withUndo<T extends object>(
  ctx: Context,
  fn: (tx: Context) => Promise<Undone<T>>,
): Promise<Undoable<T>> {
  if (ctx.transactionID !== undefined) {
    throw new Error('withUndo() inside a transaction: fold the restore into the caller instead')
  }
  const { data, restore } = await withTransaction(ctx, fn)
  const now = Date.now()
  const expiresAt = now + RECEIPT_TTL_MS
  const undoToken = record({ userId: ctx.user.id, restore, expiresAt }, now)
  return { ...data, undoToken, undoSeconds: Math.floor((expiresAt - now) / 1000) }
}

/**
 * AD-20: the only entry point, behind one `undoAction`. Uses the token once
 * and runs its restore in one transaction with the undo request's context,
 * all or nothing. Fails with `DomainError('UNDO_FAILED')` when the token is
 * unknown (never issued, evicted, or issued before a restart), expired, or
 * another user's, and when the restore throws; then the transaction has
 * rolled back and the cause is logged. The receipt is deleted before the
 * restore runs, so a failed restore is not retried. Another user's attempt
 * leaves the receipt in place: a guess never spends the owner's Undo.
 */
export async function undo(ctx: Context, token: string): Promise<void> {
  const store = receipts()
  const receipt = store.get(token)
  if (!receipt || receipt.expiresAt <= Date.now()) {
    store.delete(token)
    throw new DomainError('UNDO_FAILED')
  }
  if (receipt.userId !== ctx.user.id) throw new DomainError('UNDO_FAILED')
  store.delete(token)
  try {
    await withTransaction(ctx, (tx) => receipt.restore(tx))
  } catch (err) {
    logger().warn({ err }, 'Undo restore failed')
    throw new DomainError('UNDO_FAILED')
  }
}
