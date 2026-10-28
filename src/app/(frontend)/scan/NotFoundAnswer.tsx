import { getTranslations } from 'next-intl/server'

import type { WishlistLine } from '@/lib/wishlists/wishlists'

import { NotFoundForm } from './NotFoundForm'

/**
 * The Not found Answer (EXPERIENCE.md, Answer; FR-12, FR-22): no Book to
 * show, so no `AnswerLayout`. With an ISBN, a line naming it as stored, then
 * the Title and Author fields with Add to wishlist, Add to library and Back.
 * `title` prefills the Title field; `lists` are the viewer's wishlists.
 */
export async function NotFoundAnswer({
  isbn13,
  title,
  lists,
}: {
  isbn13: string | null
  title: string
  lists: readonly WishlistLine[]
}) {
  const t = await getTranslations()

  return (
    <div className="flex flex-col gap-6">
      {isbn13 !== null && (
        <p className="text-meta text-text-muted">{t('answer.noSource', { isbn: isbn13 })}</p>
      )}
      <NotFoundForm isbn13={isbn13} title={title} lists={lists} />
    </div>
  )
}
