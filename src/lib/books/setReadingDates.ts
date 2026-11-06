import { isCalendarDate } from '@/fields/readingDates'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { withTransaction } from '@/lib/payload/transaction'

import type { UserBookState } from './effectiveBook'
import { requireOwnBook } from './requireOwnBook'
import { upsertUserBook } from './upsertUserBook'
import { getUserBookState } from './userBookState'

/** AD-18: edit calendar dates immediately, returning the complete state, without Undo. */
export async function setReadingDates(
  ctx: Context,
  bookId: number,
  dates: { readingSince: string | null; finishedAt: string | null },
): Promise<UserBookState> {
  return withTransaction(ctx, async (tx) => {
    await requireOwnBook(tx, bookId)
    for (const field of ['readingSince', 'finishedAt'] as const) {
      if (dates[field] !== null && !isCalendarDate(dates[field])) {
        throw new DomainError('VALIDATION', { fields: { [field]: 'VALIDATION' } })
      }
    }
    const current = await getUserBookState(tx, bookId)
    if (current.state === 'reading' && dates.readingSince === null) {
      throw new DomainError('VALIDATION', { fields: { readingSince: 'VALIDATION' } })
    }
    await upsertUserBook(tx, bookId, {
      ...dates,
      ...(current.state === 'reading' && dates.finishedAt !== null ? { read: true } : {}),
    })
    return getUserBookState(tx, bookId)
  })
}
