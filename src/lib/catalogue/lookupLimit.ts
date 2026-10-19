import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { processState } from '@/lib/processState'

// Spine, AD-9, AD-12 and FR-11: one per-user limit on lookups, held in process.
// `lookupBook` calls `limitLookups()`; `searchBooks` (I10) and `lookupAgain` must
// call it too when they arrive, so a runaway client cannot ask Finna and Google
// Books in the user's name unchecked.

/** Lookups a user may make per window, every role included. */
export const LOOKUP_LIMIT = 30
/** A fixed window, started by the user's first lookup after the previous one ran out. */
export const LOOKUP_WINDOW_MS = 60_000

type Window = { count: number; resetAt: number }

// Bounded (AD-12): every call drops the expired windows, so only users active
// within the last window have an entry.
const windows = () => processState('catalogue.lookupLimit', () => new Map<number, Window>())

/**
 * AD-9, AD-12 and FR-11: counts one lookup for `ctx.user` and throws
 * `DomainError('RATE_LIMITED')` once the user is over `LOOKUP_LIMIT` in the
 * current window. A refused call does not move the window's reset. Called by
 * `lookupBook` before it reads or asks a source; `searchBooks` (I10) and
 * `lookupAgain` must call it the same way when they arrive.
 */
export function limitLookups(ctx: Context): void {
  const now = Date.now()
  const store = windows()
  for (const [userId, { resetAt }] of store) if (resetAt <= now) store.delete(userId)
  const current = store.get(ctx.user.id)
  if (!current) {
    store.set(ctx.user.id, { count: 1, resetAt: now + LOOKUP_WINDOW_MS })
    return
  }
  if (++current.count > LOOKUP_LIMIT) throw new DomainError('RATE_LIMITED')
}
