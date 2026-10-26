import { getHoldings } from '@/lib/books/holdings'
import type { Context } from '@/lib/payload/context'
import { isRowId } from '@/lib/payload/ref'

/**
 * The copy Edit book was opened for, as saved. An ordered copy's `location`
 * is the user's default location, the one owned would give it.
 */
export type SavedCopy = { id: number; status: 'owned' | 'ordered'; location: number | null }

/**
 * The viewer's copy `param` of the Book, or `null` when `param` is not the
 * digits of a row id (`isRowId()`) or names no copy of theirs of this Book.
 * An ordered copy's location is the user's default, what owned would give
 * it.
 */
export async function savedCopy(
  ctx: Context,
  bookId: number,
  param: string | string[] | undefined,
): Promise<SavedCopy | null> {
  if (typeof param !== 'string' || !/^\d+$/.test(param) || !isRowId(Number(param))) return null
  const copyId = Number(param)
  const line = (await getHoldings(ctx, [bookId]))
    .get(bookId)
    ?.copies.find((held) => held.copyId === copyId)
  if (!line) return null
  if (line.status === 'owned') {
    return { id: copyId, status: 'owned', location: line.location?.id ?? null }
  }
  const fallback = ctx.user.defaultLocation
  const location = fallback == null ? null : typeof fallback === 'number' ? fallback : fallback.id
  return { id: copyId, status: 'ordered', location }
}
