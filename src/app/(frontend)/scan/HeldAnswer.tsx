import { getTranslations } from 'next-intl/server'

import { RefreshOnUndo } from '../(sections)/RefreshOnUndo'
import type { CopyTarget } from '../saveInput'

import { AddToLibrary } from './AddToLibrary'
import { factLines, type HeldAnswer as Held } from './answer'
import { AnswerBack } from './AnswerBack'
import { AnswerLayout } from './AnswerLayout'
import { AnswerLookUpAgain } from './AnswerLookUpAgain'
import { OpenBook } from './OpenBook'

/**
 * The held Answer (EXPERIENCE.md, Answer screens; FR-16, FR-20, FR-30): the
 * Book, then every fact the viewer holds as its own line -- a copy's
 * "Tampere · owned", or "Owned" with no location; a lent copy's "Mökki · ■
 * Lent · Antti", the square being the lent marker; an ordered copy's
 * "Ordered" with its own Received Link; an open entry's "On Toiveet", with
 * its recipient when it has one -- and at the foot the buttons the heading
 * calls for, one primary (UX-DR46):
 *
 * - **In library** (an owned copy): Open book, Add another copy, Back
 *   (primary), and Look it up again under the Book on the viewer's own
 *   private Book.
 * - **Ordered** (copies, none owned): Back alone. FR-28 is reached through a
 *   line's Received, not a button.
 * - **On wishlist** (open entries only): Add to library (primary), which
 *   closes the viewer's own open entries for the Book in the save's
 *   transaction (`saveCopy`), then Back.
 *
 * `RefreshOnUndo` sits here rather than on the Received Link: an undone
 * Received orders the copy again, and the Link that raised the toast is gone
 * by then, unmounted by its own refresh.
 */
export async function HeldAnswer({ answer }: { answer: Held }) {
  const t = await getTranslations()
  // A Book with no ISBN is saved by id, which `requireOwnBook()` gates (I12).
  const target: CopyTarget =
    answer.isbn13 === null ? { bookId: answer.bookId } : { isbn13: answer.isbn13 }
  const lines = factLines(answer.facts, {
    copy: (status) => t('answer.copy', { status }),
    copyAt: (location, status) => t('answer.copyAt', { location, status }),
    lent: (person) => t('loans.lentMarker', { person }),
    onList: (list) => t('answer.onList', { list }),
    onListFor: (list, person) => t('answer.onListFor', { list, person }),
  })

  return (
    <AnswerLayout
      book={answer}
      lines={lines}
      editions={answer.lookAgain ? <AnswerLookUpAgain bookId={answer.bookId} /> : undefined}
    >
      {answer.heading === 'inLibrary' && (
        <>
          <OpenBook bookId={answer.bookId} label={t('answer.openBook')} />
          <AddToLibrary target={target} another />
        </>
      )}
      {answer.heading === 'onWishlist' && <AddToLibrary target={target} />}
      <RefreshOnUndo />
      <AnswerBack
        label={t('answer.back')}
        variant={answer.heading === 'onWishlist' ? 'secondary' : 'primary'}
      />
    </AnswerLayout>
  )
}
