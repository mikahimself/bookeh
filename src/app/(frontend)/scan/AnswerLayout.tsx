import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { Cover } from '../components/Cover'
import { markerSlotClass } from '../components/ui/classes'

import { answerLines, type AnswerBook, type AnswerLine } from './answer'

/**
 * An Answer's body (EXPERIENCE.md, Answer; DESIGN.md, Detail panel
 * composition): the cover beside the title, the author and edition lines
 * under it, then `lines` (the viewer's copies, a lent one with the lent marker), then where the record comes
 * from and what a save would create, then `editions` (the line under the
 * Book: the edition picker's Link, or Look it up again), and at the foot `children`, the Answer's buttons. A line with
 * nothing to show is left out.
 */
export async function AnswerLayout({
  book,
  lines = [],
  editions,
  children,
}: {
  book: AnswerBook
  lines?: AnswerLine[]
  editions?: ReactNode
  children: ReactNode
}) {
  const t = await getTranslations()
  const sources = await getTranslations('sources')
  const { authors, edition, notes } = answerLines(book, {
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
          <Cover src={book.cover} title={book.title} language={book.language} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-heading-detail break-words text-text">{book.title}</h2>
          {authors && <p className="text-body text-text">{authors}</p>}
          {edition && <p className="text-meta text-text-muted">{edition}</p>}
        </div>
      </div>
      {lines.length > 0 && (
        <ul className="flex flex-col gap-1">
          {lines.map((line, index) => (
            <li key={index} className="text-body text-text">
              {line.text && line.lent ? `${line.text} · ` : line.text}
              {line.lent && (
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className={`${markerSlotClass} bg-accent`} />
                  {line.lent}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <div className="flex flex-col gap-1">
          {notes.map((line, index) => (
            <p key={index} className="text-meta text-text-muted">
              {line}
            </p>
          ))}
        </div>
      )}
      {editions}
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}
