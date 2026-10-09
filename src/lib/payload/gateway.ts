import type { CollectionSlug, TypedCollectionSelect } from 'payload'

import type { Context } from './context'

/**
 * Spine, AD-2: the only way into Payload for frontend-reachable code. Every
 * function runs the Local API with the context's `req`, its `user`,
 * `overrideAccess: false` and `showHiddenFields: false`, spread after the
 * caller's options so nothing overrides them; the option types leave those
 * keys out. Writes are by ID only: no `where`-based update or delete. Calls on
 * one context run one at a time, never concurrently, since they share its req
 * and transaction (AD-16).
 *
 * Services use it as `import * as gateway from '@/lib/payload/gateway'`.
 */

type Scope = {
  req: Context['req']
  user: Context['user']
  overrideAccess: false
  showHiddenFields: false
}
type Scoped<T> = T extends unknown ? Omit<T, keyof Scope> : never

const scope = (ctx: Context): Scope => ({
  req: ctx.req,
  user: ctx.user,
  overrideAccess: false,
  showHiddenFields: false,
})

export function find<S extends CollectionSlug, Sel extends TypedCollectionSelect[S]>(
  ctx: Context,
  options: Scoped<Parameters<typeof ctx.req.payload.find<S, Sel>>[0]>,
) {
  return ctx.req.payload.find<S, Sel>({ ...options, ...scope(ctx) })
}

export function findByID<S extends CollectionSlug, Sel extends TypedCollectionSelect[S]>(
  ctx: Context,
  options: Scoped<Parameters<typeof ctx.req.payload.findByID<S, false, Sel>>[0]>,
) {
  return ctx.req.payload.findByID<S, false, Sel>({ ...options, ...scope(ctx) })
}

export function count<S extends CollectionSlug>(
  ctx: Context,
  options: Scoped<Parameters<typeof ctx.req.payload.count<S>>[0]>,
) {
  return ctx.req.payload.count<S>({ ...options, ...scope(ctx) })
}

export function create<S extends CollectionSlug, Sel extends TypedCollectionSelect[S]>(
  ctx: Context,
  options: Scoped<Parameters<typeof ctx.req.payload.create<S, Sel>>[0]>,
) {
  return ctx.req.payload.create<S, Sel>({ ...options, ...scope(ctx) })
}

// `update` is overloaded and `Parameters` takes the last overload, the by-ID one.
export function updateByID<S extends CollectionSlug, Sel extends TypedCollectionSelect[S]>(
  ctx: Context,
  options: Scoped<Parameters<typeof ctx.req.payload.update<S, Sel>>[0]> & { id: number },
) {
  return ctx.req.payload.update<S, Sel>({ ...options, ...scope(ctx) })
}

// `delete` is overloaded and its last overload is the `where` one, so its
// `id` and `where` are swapped for a numeric `id`.
export function deleteByID<S extends CollectionSlug, Sel extends TypedCollectionSelect[S]>(
  ctx: Context,
  options: Scoped<Omit<Parameters<typeof ctx.req.payload.delete<S, Sel>>[0], 'id' | 'where'>> & {
    id: number
  },
) {
  return ctx.req.payload.delete<S, Sel>({ ...options, ...scope(ctx) })
}
