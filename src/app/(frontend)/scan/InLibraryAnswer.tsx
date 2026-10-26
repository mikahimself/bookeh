import { getTranslations } from 'next-intl/server'

import { AddToLibrary } from './AddToLibrary'
import { copyLines, type InLibrary } from './answer'
import { AnswerBack } from './AnswerBack'
import { AnswerLayout } from './AnswerLayout'
import { AnswerLookUpAgain } from './AnswerLookUpAgain'
import { OpenBook } from './OpenBook'

/**
 * The In library Answer (EXPERIENCE.md, Answer; FR-16, FR-20, FR-30): the
 * Book, a line per copy ("Tampere · owned", or "Owned" with no location; a lent
 * copy's "Mökki · ■ Lent · Antti", the square being the lent marker),
 * Look it up again under them on the viewer's own private Book, and at the
 * foot Open book, then Add another copy, then Back, the one primary
 * (UX-DR46).
 */
export async function InLibraryAnswer({ answer }: { answer: InLibrary }) {
  const t = await getTranslations()
  const lines = copyLines(answer.copies, {
    copy: (status) => t('answer.copy', { status }),
    copyAt: (location, status) => t('answer.copyAt', { location, status }),
    lent: (person) => t('loans.lentMarker', { person }),
  })

  return (
    <AnswerLayout
      book={answer}
      lines={lines}
      editions={answer.lookAgain ? <AnswerLookUpAgain bookId={answer.bookId} /> : undefined}
    >
      <OpenBook bookId={answer.bookId} label={t('answer.openBook')} />
      <AddToLibrary isbn13={answer.isbn13} another />
      <AnswerBack label={t('answer.back')} variant="primary" />
    </AnswerLayout>
  )
}
