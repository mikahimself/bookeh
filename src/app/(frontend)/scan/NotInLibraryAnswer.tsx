import { getTranslations } from 'next-intl/server'

import { AddToLibrary } from './AddToLibrary'
import type { AnswerBook } from './answer'
import { AnswerBack } from './AnswerBack'
import { AnswerLayout } from './AnswerLayout'

/**
 * The Not in library Answer (EXPERIENCE.md, Answer): the Book, and at the
 * foot Add to library, the one primary, above Back.
 */
export async function NotInLibraryAnswer({ answer }: { answer: AnswerBook }) {
  const t = await getTranslations()

  return (
    <AnswerLayout book={answer}>
      <AddToLibrary isbn13={answer.isbn13} />
      <AnswerBack label={t('answer.back')} />
    </AnswerLayout>
  )
}
