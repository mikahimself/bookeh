import { getTranslations } from 'next-intl/server'

import { Cover } from '../components/Cover'

import { AddToLibrary } from './AddToLibrary'
import { answerLines, type NotInLibrary } from './answer'
import { AnswerBack } from './AnswerBack'

/**
 * The Not in library Answer (EXPERIENCE.md, Answer; DESIGN.md, Detail panel
 * composition): the cover beside the title, the author and edition lines
 * under it, then where the record comes from and what a save would create,
 * and at the foot Add to library, the one primary, above Back. A line with
 * nothing to show is left out.
 */
export async function NotInLibraryAnswer({ answer }: { answer: NotInLibrary }) {
  const t = await getTranslations()
  const sources = await getTranslations('sources')
  const { authors, edition, notes } = answerLines(answer, {
    source: (id) => {
      const key = id as Parameters<typeof sources>[0]
      return sources.has(key) ? sources(key) : undefined
    },
    from: (source) => t('answer.from', { source }),
    pages: (pages) => t('answer.pages', { pages }),
    newAuthor: (name) => t('answer.newAuthor', { name }),
    newSeries: (name) => t('answer.newSeries', { name }),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <div className="w-cover-detail shrink-0">
          <Cover src={answer.cover} title={answer.title} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-heading-detail break-words text-text">{answer.title}</h2>
          {authors && <p className="text-body text-text">{authors}</p>}
          {edition && <p className="text-meta text-text-muted">{edition}</p>}
        </div>
      </div>
      {notes.length > 0 && (
        <div className="flex flex-col gap-1">
          {notes.map((line, index) => (
            <p key={index} className="text-meta text-text-muted">
              {line}
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <AddToLibrary isbn13={answer.isbn13} />
        <AnswerBack label={t('answer.back')} />
      </div>
    </div>
  )
}
