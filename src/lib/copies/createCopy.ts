import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import type { Ref } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'

import { resolveLocation } from './locations'

/** An ordered copy has no location (AD-8). */
export type NewCopy =
  { bookId: number; status: 'owned'; location?: Ref | null } | { bookId: number; status: 'ordered' }

/**
 * Spine, AD-18: the only insert into `copies`. Creates one owned or ordered
 * copy of a Book for the context's user and resolves to its id. A Book the
 * user cannot read is refused by the collection's `readableRelation` with a
 * `ValidationError` on `book`. Any readable Book gets a copy: duplicates are
 * real.
 *
 * Location (FR-4, FR-31): an owned copy with `location` undefined lands at
 * the user's `defaultLocation`, or nowhere without one; `null` means none; a
 * `Ref` goes through `resolveLocation()`. An ordered copy never has one.
 * Resolving the location and the insert run in one `withTransaction()`,
 * joining the caller's, so a location created inline never outlives a failed
 * insert.
 */
export async function createCopy(ctx: Context, input: NewCopy): Promise<number> {
  return withTransaction(ctx, async (tx) => {
    const location = await locationFor(tx, input)
    // `owner` is what Payload's create type requires; the hook sets it from the request.
    const copy = await gateway.create(tx, {
      collection: 'copies',
      data: { owner: tx.user.id, book: input.bookId, status: input.status, location },
      depth: 0,
    })
    return copy.id
  })
}

async function locationFor(ctx: Context, input: NewCopy): Promise<number | null> {
  if (input.status === 'ordered') return null
  if (input.location === null) return null
  if (input.location !== undefined) return resolveLocation(ctx, input.location)
  const fallback = ctx.user.defaultLocation
  if (fallback === null || fallback === undefined) return null
  return typeof fallback === 'number' ? fallback : fallback.id
}
