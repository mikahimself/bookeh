import { getTranslations } from 'next-intl/server'

import type { WishlistLine } from '@/lib/wishlists/wishlists'

import { AddToLibrary } from './AddToLibrary'
import { AddToWishlist } from './AddToWishlist'
import { editionLines, type AnswerBook } from './answer'
import { AnswerBack } from './AnswerBack'
import { AnswerLayout } from './AnswerLayout'
import { EditionPicker } from './EditionPicker'

/**
 * The Not in library Answer (EXPERIENCE.md, Answer): the Book, "{n} editions
 * found" under it when the sources hold several, and at the foot Add to
 * wishlist, then Add to library, the one primary, then Back. Both save the
 * candidate shown; Add to wishlist offers `lists`, the viewer's wishlists.
 */
export async function NotInLibraryAnswer({
  answer,
  lists,
}: {
  answer: AnswerBook
  lists: readonly WishlistLine[]
}) {
  const t = await getTranslations()
  const { editions, pick } = answer
  const text = {
    pages: (pages: number) => t('answer.pages', { pages }),
    unnamed: (n: number) => t('answer.unnamedEdition', { n }),
  }

  return (
    <AnswerLayout
      book={answer}
      editions={
        editions.length > 1 && pick !== undefined ? (
          <EditionPicker
            isbn13={answer.isbn13}
            pick={pick}
            editions={editionLines(editions, text).map((line, index) => ({
              cover: editions[index]!.cover,
              title: editions[index]!.title,
              language: editions[index]!.language,
              line,
            }))}
          />
        ) : undefined
      }
    >
      <AddToWishlist
        lists={lists}
        title={answer.title}
        target={{
          isbn13: answer.isbn13,
          ...(pick !== undefined && { pick }),
          ...(answer.candidate !== undefined && { candidate: answer.candidate }),
        }}
      />
      <AddToLibrary isbn13={answer.isbn13} pick={pick} candidate={answer.candidate} />
      <AnswerBack label={t('answer.back')} />
    </AnswerLayout>
  )
}
