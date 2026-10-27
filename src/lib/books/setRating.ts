import type { Context } from '@/lib/payload/context'
import { withTransaction } from '@/lib/payload/transaction'

import { requireOwnBook } from './requireOwnBook'
import { upsertUserBook } from './upsertUserBook'

/**
 * Spine, AD-18: rates a Book for the context user, or clears the rating with
 * `null`, in the caller's transaction or one of its own (AD-16). The Book id
 * passes `requireOwnBook()` (AD-7) first, so a Book the viewer holds neither a
 * copy nor an open entry of fails with `NOT_FOUND` before any write. The
 * write goes through `upsertUserBook()`, which creates the row on the first
 * write and moves `ratedAt` with the rating (set on a value, `null` on
 * clear); a cleared rating keeps the row. Range and whole-number checks
 * stay with the collection, whose `ValidationError` comes back unchanged. No
 * Undo: rating saves at once (EXPERIENCE.md, Rating).
 */
export async function setRating(
  ctx: Context,
  bookId: number,
  rating: number | null,
): Promise<void> {
  await withTransaction(ctx, async (tx) => {
    await requireOwnBook(tx, bookId)
    await upsertUserBook(tx, bookId, { rating })
  })
}
