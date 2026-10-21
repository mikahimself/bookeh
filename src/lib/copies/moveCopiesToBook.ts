import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { withTransaction } from '@/lib/payload/transaction'

/**
 * Spine, AD-5 and AD-18: moves the viewer's own copies of one Book to
 * another, in the caller's transaction or one of its own (AD-16), and
 * resolves to the number moved. Used when a private Book merges into the
 * shared Book with its ISBN (FR-12, D-8). The find filters on `owner`
 * explicitly as well as through `ownerAccess`, so no other user's copy is
 * read or changed; a target the viewer cannot read is refused by the
 * collection's `readableRelation` with a `ValidationError` on `book`.
 */
export async function moveCopiesToBook(
  ctx: Context,
  fromBookId: number,
  toBookId: number,
): Promise<number> {
  return withTransaction(ctx, async (tx) => {
    const { docs } = await gateway.find(tx, {
      collection: 'copies',
      where: { and: [{ owner: { equals: tx.user.id } }, { book: { equals: fromBookId } }] },
      select: { book: true },
      depth: 0,
      pagination: false,
    })
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const { id } of docs) {
      await gateway.updateByID(tx, { collection: 'copies', id, data: { book: toBookId }, depth: 0 })
    }
    return docs.length
  })
}
