import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import type { Copy } from '@/payload-types'

export type NewCopy = { bookId: number; status: Copy['status'] }

/**
 * Spine, AD-18: the only insert into `copies`. Creates one owned or ordered
 * copy of a Book for the context's user and resolves to its id. A context
 * from `withTransaction()` carries the transaction on its `req`, so the write
 * joins it; outside one, the create is its own unit. A Book the user cannot
 * read is refused by the collection's `readableRelation` with a
 * `ValidationError` on `book`. Any readable Book gets a copy: duplicates are
 * real. The default-location rule is not applied yet: a new copy has no
 * location until 3.34 adds `location` and the profile default.
 */
export async function createCopy(ctx: Context, input: NewCopy): Promise<number> {
  // `owner` is what Payload's create type requires; the hook sets it from the request.
  const copy = await gateway.create(ctx, {
    collection: 'copies',
    data: { owner: ctx.user.id, book: input.bookId, status: input.status },
    depth: 0,
  })
  return copy.id
}
