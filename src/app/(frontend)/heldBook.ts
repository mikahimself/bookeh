import { getEffectiveBooks, type EffectiveBook } from '@/lib/books/effectiveBook'
import { requireOwnBook } from '@/lib/books/requireOwnBook'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'

/**
 * The Book as the viewer sees it, or `undefined` when they do not hold it
 * (AD-7). Book detail and Edit book start here.
 */
export async function heldBook(ctx: Context, bookId: number): Promise<EffectiveBook | undefined> {
  try {
    await requireOwnBook(ctx, bookId)
  } catch (err) {
    if (err instanceof DomainError && err.code === 'NOT_FOUND') return undefined
    throw err
  }
  return (await getEffectiveBooks(ctx, [bookId])).get(bookId)
}
