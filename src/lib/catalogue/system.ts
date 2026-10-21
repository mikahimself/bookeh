import type { Context } from '@/lib/payload/context'

/**
 * Spine, AD-3: the Local API options for a call with system privileges, the
 * one place in `src` that writes `overrideAccess: true`. Imported only from
 * `src/lib/catalogue` (lint). Spread it, and set another `depth` after the
 * spread. `null` only outside any request (the `onInit` sweep); inside a
 * transaction pass its context, so `req` is kept.
 */
export function system(ctx: Context | null) {
  return ctx
    ? ({ req: ctx.req, overrideAccess: true, depth: 0 } as const)
    : ({ overrideAccess: true, depth: 0 } as const)
}
