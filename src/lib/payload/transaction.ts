import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'

import type { Context } from './context'

// Outer contexts while their opener's `fn` runs: a call on one would run on
// another pooled connection, outside the transaction or blocked by its locks.
const suspended = new WeakSet<Context>()

/**
 * Throws when `ctx` carries a transaction that has ended, or is the outer
 * context of a running `withTransaction()`. Payload operations call
 * `killTransaction(req)` in their catch even when they only joined, so one
 * failed call inside `fn` (a `NotFound` read included) ends the transaction
 * and deletes `req.transactionID`; any later call on that req would
 * auto-commit outside it. Every call on `ctx.req` outside the gateway and
 * `drizzleFor()` calls this first.
 */
export function assertLive(ctx: Context): void {
  if (suspended.has(ctx)) {
    throw new Error('A transaction is open on this context: use the transaction context')
  }
  if (ctx.transactionID !== undefined && ctx.req.transactionID !== ctx.transactionID) {
    throw new Error(`Transaction ${ctx.transactionID} has ended`)
  }
}

/**
 * Spine, AD-16 and AD-11: the only place a transaction opens. Runs `fn` with
 * a context on a fresh `req` for `ctx.user` that carries the transaction;
 * commits when `fn` resolves and rolls back when it throws, rethrowing the
 * error unchanged. Called with a context that already carries a transaction,
 * it joins it: `fn` gets that context and the opener alone commits or rolls
 * back. No savepoints.
 */
export async function withTransaction<T>(
  ctx: Context,
  fn: (tx: Context) => Promise<T>,
): Promise<T> {
  if (ctx.transactionID !== undefined) {
    assertLive(ctx)
    return fn(ctx)
  }

  // A fresh req: the outer context neither joins by accident nor keeps reads
  // cached in its dataloader from a transaction that rolled back.
  const req = await createLocalReq({ user: ctx.user }, ctx.req.payload)
  if (!(await initTransaction(req))) {
    throw new Error('The database adapter did not open a transaction')
  }
  // `initTransaction` returned true, so the id has resolved onto the req.
  const tx: Context = { req, user: ctx.user, transactionID: req.transactionID as number | string }
  suspended.add(ctx)
  try {
    const result = await fn(tx)
    assertLive(tx)
    await commitTransaction(req)
    return result
  } catch (err) {
    await killTransaction(req)
    throw err
  } finally {
    suspended.delete(ctx)
  }
}
