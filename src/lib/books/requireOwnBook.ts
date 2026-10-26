import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { isRowId } from '@/lib/payload/ref'

/**
 * Spine, AD-7: the one gate for a Book reached by id. Book detail, Edit book
 * and every `{ bookId }` a client sends pass it first. It resolves only when
 * the viewer has a copy of the Book, owned or ordered, and fails with
 * `NOT_FOUND` otherwise. An id that is not a row id (`isRowId()`) fails
 * before any read.
 *
 * Holding a copy is the whole rule: `books` is not read, so a shared Book the
 * admin later made private still passes (as in `getHoldings()`). The
 * gateway's `count` on `copies` reaches the viewer's own rows alone
 * (AD-6/AD-17, the admin included), so no `owner` condition is needed. Open
 * wishlist entries join the rule in Epic 7.
 */
export async function requireOwnBook(ctx: Context, bookId: number): Promise<void> {
  if (!isRowId(bookId)) throw new DomainError('NOT_FOUND')
  const { totalDocs } = await gateway.count(ctx, {
    collection: 'copies',
    where: { book: { equals: bookId } },
  })
  if (totalDocs === 0) throw new DomainError('NOT_FOUND')
}
