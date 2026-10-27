import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { processState } from '@/lib/processState'

// Spine, AD-11 and AD-12: a double tap or a retried request saves once. The
// first call's promise is held in process under (user, kind, `requestId`), so
// a repeat, a concurrent one included, awaits the same save. Lost on restart.

/** A repeat within this window returns the first result. */
export const REQUEST_WINDOW_MS = 10 * 60_000
/** AD-12: the memory is bounded; the oldest requests go first. */
export const REQUEST_MEMORY_SIZE = 500

type Entry = { result: Promise<unknown>; expiresAt: number }

// Insertion order is age: the first key is the oldest request.
const requests = () => processState('catalogue.saveRequests', () => new Map<string, Entry>())

/** The kinds of save, each with its own memory: a repeat never gets the other's result. */
export type SaveKind = 'copy' | 'entry'

/**
 * AD-11 and AD-12: runs `run` once per `kind` and `requestId` of `ctx.user`
 * within `REQUEST_WINDOW_MS`. A repeat of a live id of the same kind returns
 * the first call's promise and does not call `run`. The promise is stored
 * before anything is awaited, so a concurrent repeat finds it. A rejected
 * call is forgotten: a retry runs again, while callers already awaiting it
 * get the same rejection. A `requestId` that is not 1–64 characters fails
 * with `DomainError('VALIDATION')` before `run`.
 */
export async function oncePerRequest<T>(
  ctx: Context,
  kind: SaveKind,
  requestId: string,
  run: () => Promise<T>,
): Promise<T> {
  if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 64) {
    throw new DomainError('VALIDATION')
  }
  const key = `${ctx.user.id}:${kind}:${requestId}`
  const now = Date.now()
  const store = requests()
  const live = store.get(key)
  if (live && live.expiresAt > now) return live.result as Promise<T>

  for (const [k, { expiresAt }] of store) {
    if (expiresAt <= now) store.delete(k)
  }
  for (const oldest of store.keys()) {
    if (store.size < REQUEST_MEMORY_SIZE) break
    store.delete(oldest)
  }
  const entry: Entry = { result: run(), expiresAt: now + REQUEST_WINDOW_MS }
  store.set(key, entry)
  entry.result.catch(() => {
    if (store.get(key) === entry) store.delete(key)
  })
  return entry.result as Promise<T>
}
