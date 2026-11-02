import { getFormatter, getTranslations } from 'next-intl/server'

import type { WishlistLine } from '@/lib/wishlists/wishlists'

import { AddToWishlist } from '../components/AddToWishlist'

import { AddToLibrary } from './AddToLibrary'
import { editionLines, type SourceAnswer } from './answer'
import { AnswerBack } from './AnswerBack'
import { AnswerLayout } from './AnswerLayout'
import { EditionPicker } from './EditionPicker'
import { PartialLookupLine } from './PartialLookupLine'

/**
 * The Not in library Answer (EXPERIENCE.md, Answer): the Book, "{n} editions
 * found" under it when the sources hold several, and at the foot Add to
 * wishlist, then Add to library, the one primary, then Back. Both save the
 * candidate shown; Add to wishlist offers `lists`, the viewer's wishlists.
 * When a source failed and another found the Book, the notes end with
 * `PartialLookupLine`. Finnish objects decline, hence `sourcesPartitive`; a
 * source with no label shows its id, in either catalogue. The Answer always
 * carries an ISBN (`SourceAnswer`): the picker, the cover preview and both
 * saves address it.
 */
export async function NotInLibraryAnswer({
  answer,
  lists,
}: {
  answer: SourceAnswer
  lists: readonly WishlistLine[]
}) {
  const t = await getTranslations()
  const labels = await getTranslations('sources')
  const partitives = await getTranslations('sourcesPartitive')
  const format = await getFormatter()
  const { editions, failed, pick } = answer
  const label = (id: string) => {
    const key = id as Parameters<typeof labels>[0]
    return labels.has(key) ? labels(key) : id
  }
  const partitive = (id: string) => {
    const key = id as Parameters<typeof partitives>[0]
    return partitives.has(key) ? partitives(key) : id
  }
  const list = (names: string[]) => format.list(names, { type: 'conjunction' })
  // Both saves are for the candidate shown, addressed by the ISBN asked for.
  const target = {
    isbn13: answer.isbn13,
    ...(pick !== undefined && { pick }),
    ...(answer.candidate !== undefined && { candidate: answer.candidate }),
  }
  const text = {
    pages: (pages: number) => t('answer.pages', { pages }),
    unnamed: (n: number) => t('answer.unnamedEdition', { n }),
  }

  return (
    <AnswerLayout
      book={answer}
      sourceNote={
        failed.length > 0 && answer.source !== null ? (
          <PartialLookupLine
            isbn13={answer.isbn13}
            text={t('answer.partial', {
              sources: list(failed.map(label)),
              count: failed.length,
              found: partitive(answer.source),
            })}
            tryLabel={t('answer.tryPartial', { sources: list(failed.map(partitive)) })}
          />
        ) : undefined
      }
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
      <AddToWishlist lists={lists} title={answer.title} target={target} />
      <AddToLibrary target={target} />
      <AnswerBack label={t('answer.back')} />
    </AnswerLayout>
  )
}
