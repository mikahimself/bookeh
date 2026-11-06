import { logger } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { otherEditions } from '@/lib/shelf/otherEditions'

import { otherEditionRows, type OtherEdition, type ScanOutcome } from './answer'

/**
 * The other-edition notice's rows for `outcome` (FR-20): read for Not in
 * library, and for the held Answers headed Ordered or On wishlist, excluding
 * that Book by id. A Not in library Book is one the viewer has no copy of, so
 * it has nothing to exclude. `[]` for every other Answer, and for a failed
 * read, which is logged: the Answer then renders without the notice.
 */
export async function otherEditionsFor(
  ctx: Context,
  outcome: ScanOutcome,
): Promise<OtherEdition[]> {
  const target =
    outcome.kind === 'notInLibrary'
      ? { bookId: null, answer: outcome.answer }
      : outcome.kind === 'held' &&
          (outcome.answer.heading === 'ordered' || outcome.answer.heading === 'onWishlist')
        ? { bookId: outcome.answer.bookId, answer: outcome.answer }
        : null
  if (!target) return []
  const { bookId, answer } = target
  try {
    return otherEditionRows(
      await otherEditions(ctx, { bookId, title: answer.title, authors: answer.authors }),
    )
  } catch (err) {
    logger().error({ err }, 'The other editions failed to load')
    return []
  }
}
