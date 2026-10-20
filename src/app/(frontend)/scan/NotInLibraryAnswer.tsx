import { getTranslations } from 'next-intl/server'

import { AddToLibrary } from './AddToLibrary'
import { editionLines, type AnswerBook } from './answer'
import { AnswerBack } from './AnswerBack'
import { AnswerLayout } from './AnswerLayout'
import { EditionPicker } from './EditionPicker'

/**
 * The Not in library Answer (EXPERIENCE.md, Answer): the Book, "{n} editions
 * found" under it when the sources hold several, and at the foot Add to
 * library, the one primary, above Back. Add to library saves the candidate
 * shown.
 */
export async function NotInLibraryAnswer({ answer }: { answer: AnswerBook }) {
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
              line,
            }))}
          />
        ) : undefined
      }
    >
      <AddToLibrary isbn13={answer.isbn13} pick={pick} />
      <AnswerBack label={t('answer.back')} />
    </AnswerLayout>
  )
}
