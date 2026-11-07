'use client'

import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useId } from 'react'

import { helsinkiToday } from '@/fields/readingDates'
import { shelfHref, type ReadingBook, type ShelfQuery } from '@/lib/shelf/query'

import { Cover } from '../components/Cover'

import { sinceDay } from './readingLine'

/**
 * EXPERIENCE.md, Collection controls → Currently reading; DESIGN.md,
 * Currently reading strip: a heading, then one covers-s tile per Book being
 * read (`readingNow()` order, oldest start first) with its title and "since
 * {date}", in one row that scrolls sideways. No divider or box; the space
 * below separates it from the count line. A tile opens Book detail like a
 * row does: pushing, or replacing while a Book (`open`) is open. Tiles carry
 * no marker. The date is day and short month, with the year only when it
 * is not this year, so it fits the tile.
 */
export function ReadingStrip({
  reading,
  query,
  open,
}: {
  reading: ReadingBook[]
  query: ShelfQuery
  open: number | null
}) {
  const t = useTranslations('collection')
  const format = useFormatter()
  const heading = useId()
  const today = helsinkiToday()
  const day = (since: string) =>
    format.dateTime(new Date(`${since}T12:00:00Z`), sinceDay(since, today))

  return (
    <section aria-labelledby={heading} className="pb-2">
      <h2 id={heading} className="text-heading-group text-text-muted ui-case">
        {t('readingNow')}
      </h2>
      <ul className="flex gap-3 overflow-x-auto pt-2">
        {reading.map(({ book, since }) => (
          <li key={book.bookId} className="w-tile-s shrink-0">
            <Link
              href={shelfHref(query, { book: book.bookId })}
              replace={open !== null}
              scroll={false}
              prefetch={false}
              className="block"
            >
              <Cover src={book.coverUrl} title={book.title} language={book.language} />
              <p className="truncate pt-1 text-label text-text">{book.title}</p>
              <p className="truncate text-label text-text-muted">
                {t('readingSince', { date: day(since) })}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
