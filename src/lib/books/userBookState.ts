import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf } from '@/lib/payload/ref'

import type { UserBookState } from './effectiveBook'

/** The viewer's private Book state; missing state is unread, unrated and unclassified. */
export async function getUserBookState(ctx: Context, bookId: number): Promise<UserBookState> {
  const { docs } = await gateway.find(ctx, {
    collection: 'user-books',
    where: { and: [{ book: { equals: bookId } }, { owner: { equals: ctx.user.id } }] },
    select: { read: true, rating: true, tags: true },
    limit: 1,
    depth: 1,
  })
  const row = docs[0]
  return {
    read: row?.read ?? false,
    rating: row?.rating ?? null,
    tags: (row?.tags ?? []).flatMap((tag) =>
      typeof tag === 'object' && idOf(tag.owner) === ctx.user.id
        ? [{ id: tag.id, name: tag.name, kind: tag.kind }]
        : [],
    ),
  }
}
