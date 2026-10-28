import { getFormatter, getTranslations } from 'next-intl/server'

import type { SourceId } from '@/lib/metadata/source'
import type { WishlistLine } from '@/lib/wishlists/wishlists'

import { UnavailableActions } from './UnavailableActions'

/**
 * The Couldn't look it up Answer (EXPERIENCE.md, Answer; AD-9): no Book to
 * show, so no `AnswerLayout`. A line naming the sources that did not answer,
 * in the lookup's order, and the ISBN as stored, then Add by hand, Try again
 * and Back. `lists`, the viewer's wishlists, go to Add by hand's form.
 */
export async function UnavailableAnswer({
  isbn13,
  failed,
  lists,
}: {
  isbn13: string
  failed: SourceId[]
  lists: readonly WishlistLine[]
}) {
  const t = await getTranslations()
  const labels = await getTranslations('sources')
  const format = await getFormatter()
  const sources = format.list(
    failed.map((id) => {
      const key = id as Parameters<typeof labels>[0]
      return labels.has(key) ? labels(key) : id
    }),
    { type: 'conjunction' },
  )

  return (
    <div className="flex flex-col gap-6">
      <p className="text-meta text-text-muted">
        {t('answer.noAnswer', { sources, count: failed.length, isbn: isbn13 })}
      </p>
      <UnavailableActions isbn13={isbn13} lists={lists} />
    </div>
  )
}
