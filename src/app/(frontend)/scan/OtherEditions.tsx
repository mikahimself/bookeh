import { getTranslations } from 'next-intl/server'

import { Cover } from '../components/Cover'
import { TextLink } from '../components/Link'
import { markerSlotClass } from '../components/ui/classes'

import { factLines, type OtherEdition } from './answer'

/**
 * The other-edition notice (FR-20; option B of
 * `mockups/other-edition-options.html`): on the Not in library, On wishlist
 * and Ordered Answers, a box drawn with the toast's 2px ink border and no
 * fill, headed "You already own another edition" (or "other editions"), one
 * row per Book: its cover at Rows m, "publisher · year", a line per copy in
 * the held Answer's wording, and Open, to that Book's Answer. The Answers
 * mount it only when `editions` has a row.
 */
export async function OtherEditions({ editions }: { editions: readonly OtherEdition[] }) {
  const t = await getTranslations()

  return (
    <section className="flex flex-col gap-2 border-2 border-text px-3 py-2">
      <h3 className="text-body text-text">
        {t('answer.otherEditions', { count: editions.length })}
      </h3>
      <ul className="flex flex-col gap-2">
        {editions.map((edition) => (
          <li key={edition.bookId} className="flex items-center gap-3">
            <span className="w-cover-row shrink-0">
              <Cover src={edition.cover} title={edition.title} language={edition.language} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              {edition.edition && <span className="text-body text-text">{edition.edition}</span>}
              {factLines(edition.facts, {
                copy: (status) => t('answer.copy', { status }),
                copyAt: (location, status) => t('answer.copyAt', { location, status }),
                lent: (person) => t('loans.lentMarker', { person }),
                onList: (list) => t('answer.onList', { list }),
                onListFor: (list, person) => t('answer.onListFor', { list, person }),
              }).map((line, index) => (
                <span key={index} className="text-meta text-text-muted">
                  {line.text && line.lent ? `${line.text} · ` : line.text}
                  {line.lent && (
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden="true" className={`${markerSlotClass} bg-accent`} />
                      {line.lent}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <TextLink href={`/scan?book=${edition.bookId}`}>{t('answer.openOther')}</TextLink>
          </li>
        ))}
      </ul>
    </section>
  )
}
