import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { processState } from '@/lib/processState'

// Spine, AD-9, AD-12 and FR-11: one per-user limit on lookups, held in process.
// Every lookup and preview fetch in the user's name calls `limitLookups()`:
// `lookupBook`, `saveCopy` (only when no outcome is held for the ISBN),
// `refetchBook`, `lookupAgain` and `fetchCoverPreview` (only for an image it
// does not hold). `searchBooks` (I10) must call it too when it arrives, so a
// runaway client cannot ask Finna and Google Books in the user's name
// unchecked. Not counted: the cover download that follows (`storeCover()`,
// from `saveCopy`, `prepareShare` and `refetchBook`), one image per Book the
// call creates, shares or fills.

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
 * current window. A refused call does not move the window's reset. Called
 * before a source is asked: by `lookupBook` before it reads anything, by
 * `saveCopy` on a held-outcome miss before `lookupSources()`, by
 * `refetchBook` before its fresh `lookupSources()`, by `lookupAgain` on
 * every call once its gate passes, and by `fetchCoverPreview` before it
 * fetches an image it does not hold. `searchBooks` (I10) must call it the
 * same way when it arrives.
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
