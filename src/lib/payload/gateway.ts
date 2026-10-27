import type { CollectionSlug, TypedCollectionSelect } from 'payload'

import type { Context } from './context'
import { assertLive } from './transaction'

/**
 * Spine, AD-2: the only way into Payload for frontend-reachable code. Every
 * function runs the Local API with the context's `req`, its `user`,
 * `overrideAccess: false` and `showHiddenFields: false`, spread after the
 * caller's options so nothing overrides them; the option types leave those
 * keys out. Writes are by ID only: no `where`-based update or delete, and
 * `updateByID`/`deleteByID` throw on a `where` key before Payload is called,
 * so one smuggled past the types cannot widen the write. Calls on
 * one context run one at a time, never concurrently, since they share its req
 * and transaction (AD-16). A context from `withTransaction()` carries the
 * transaction on its `req`, so every call on it joins; once Payload has rolled
 * that transaction back, every call on the context throws.
 *
 * Services use it as `import * as gateway from '@/lib/payload/gateway'`.
 */

type Scope = {
  req: Context['req']
  user: Context['user']
  overrideAccess: false
  showHiddenFields: false
}
/**
 * Payload's own collections (`payload-kv`, `payload-preferences`, ...) are
 * never reached through the gateway. Leaving them out also keeps the
 * generic `TypedCollectionSelect[S]` checks small: TypeScript relates a
 * select to the intersection of every slug's `XSelect<false> | XSelect<true>`,
 * 2^n members for n slugs, and past 16 slugs that exceeds its 100 000-member
 * union limit (TS2590). `wishlist-entries` made 17 with Payload's four.
 * Excluding them, the limit is now 16 app slugs and 13 are in use: a 17th
 * app collection hits TS2590 again and needs the generics reworked (e.g. not
 * constraining `Sel` to `TypedCollectionSelect[S]` on a generic `S`).
 */
type AppSlug = Exclude<CollectionSlug, `payload-${string}`>

type Scoped<T> = T extends unknown ? Omit<T, keyof Scope> : never

// The functions are `async` so a dead context rejects like any failed call.
const scope = (ctx: Context): Scope => {
  assertLive(ctx)
  return {
    req: ctx.req,
    user: ctx.user,
    overrideAccess: false,
    showHiddenFields: false,
  }
}

export async function find<S extends AppSlug, Sel extends TypedCollectionSelect[S]>(
  ctx: Context,
  options: Scoped<Parameters<typeof ctx.req.payload.find<S, Sel>>[0]>,
) {
  return ctx.req.payload.find<S, Sel>({ ...options, ...scope(ctx) })
}

export async function findByID<S extends AppSlug, Sel extends TypedCollectionSelect[S]>(
  ctx: Context,
  options: Scoped<Parameters<typeof ctx.req.payload.findByID<S, false, Sel>>[0]>,
) {
  return ctx.req.payload.findByID<S, false, Sel>({ ...options, ...scope(ctx) })
}

export async function count<S extends AppSlug>(
  ctx: Context,
  options: Scoped<Parameters<typeof ctx.req.payload.count<S>>[0]>,
) {
  return ctx.req.payload.count<S>({ ...options, ...scope(ctx) })
}

export async function create<S extends AppSlug, Sel extends TypedCollectionSelect[S]>(
  ctx: Context,
  options: Scoped<Parameters<typeof ctx.req.payload.create<S, Sel>>[0]>,
) {
  return ctx.req.payload.create<S, Sel>({ ...options, ...scope(ctx) })
}

const refuseWhere = (options: object): void => {
  if ('where' in options) throw new Error('Gateway writes are by ID only: `where` is refused.')
}

// `update` is overloaded and `Parameters` takes the last overload, the by-ID one.
export async function updateByID<S extends AppSlug, Sel extends TypedCollectionSelect[S]>(
  ctx: Context,
  options: Scoped<Parameters<typeof ctx.req.payload.update<S, Sel>>[0]> & { id: number },
) {
  refuseWhere(options)
  return ctx.req.payload.update<S, Sel>({ ...options, ...scope(ctx) })
}

// `delete` is overloaded and its last overload is the `where` one, so its
// `id` and `where` are swapped for a numeric `id`.
export async function deleteByID<S extends AppSlug, Sel extends TypedCollectionSelect[S]>(
  ctx: Context,
  options: Scoped<Omit<Parameters<typeof ctx.req.payload.delete<S, Sel>>[0], 'id' | 'where'>> & {
    id: number
  },
) {
  refuseWhere(options)
  return ctx.req.payload.delete<S, Sel>({ ...options, ...scope(ctx) })
}
