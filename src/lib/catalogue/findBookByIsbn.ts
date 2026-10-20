import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import type { Book } from '@/payload-types'

/** A Book the context's user may hold for an ISBN. */
export type HeldBook = Pick<Book, 'id' | 'visibility'>

/**
 * AD-4 and AD-5: the Book a user may hold for a normalised ISBN-13, for lookup
 * and save alike. The shared Book wins; otherwise the user's own private Book.
 * The read scopes explicitly to shared or the user's own private row: the
 * admin's read access reaches every private Book, and the answer is never
 * someone else's. `undefined` when neither exists.
 */
export async function findBookByIsbn(ctx: Context, isbn13: string): Promise<HeldBook | undefined> {
  // At most one shared and one own private row (`isbnIndexes`, AD-19).
  const { docs } = await gateway.find(ctx, {
    collection: 'books',
    where: {
      and: [
        { isbn13: { equals: isbn13 } },
        { or: [{ visibility: { equals: 'shared' } }, { createdBy: { equals: ctx.user.id } }] },
      ],
    },
    select: { visibility: true },
    depth: 0,
    limit: 2,
    pagination: false,
  })
  const book = docs.find((doc) => doc.visibility === 'shared') ?? docs[0]
  return book && { id: book.id, visibility: book.visibility }
}
