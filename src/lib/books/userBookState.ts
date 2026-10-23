import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'

import type { UserBookState } from './effectiveBook'

/**
 * The viewer's read flag and rating on one Book, from their `user-books` row;
 * without a row, unread and unrated (AD-6). `user-books` access scopes the
 * find to the viewer. Tags arrive with Epic 9. The caller gates the Book id
 * (`requireOwnBook()`, AD-7).
 */
export async function getUserBookState(
  ctx: Context,
  bookId: number,
): Promise<Pick<UserBookState, 'read' | 'rating'>> {
  const { docs } = await gateway.find(ctx, {
    collection: 'user-books',
    where: { book: { equals: bookId } },
    select: { read: true, rating: true },
    limit: 1,
    depth: 0,
  })
  const row = docs[0]
  return { read: row?.read ?? false, rating: row?.rating ?? null }
}
