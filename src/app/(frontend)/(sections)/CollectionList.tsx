'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'

import { shelfHref, type ShelfQuery, type ShelfRow } from '@/lib/shelf/query'

import { buttonClass } from '../components/Button'
import { TextLink } from '../components/Link'
import { ProgressLine } from '../components/ProgressLine'

import type { DevicePrefs } from '../prefs'

import { BookRow } from './BookRow'
import { useCollectionDisplay } from './CollectionDisplay'
import { activeValues, clearHref, isNarrowed } from './countLine'
import { CoverTile } from './CoverTile'
import { useSelection } from './Selection'
import { useShelfRows } from './ShelfRows'

/** Between the count line's parts (EXPERIENCE.md, Count line). */
const SEPARATOR = ' · '

/** DESIGN.md, Collection density: cover columns at least this wide, with this gap. */
const GRID: Record<DevicePrefs['size'], string> = {
  s: 'grid-cols-[repeat(auto-fill,minmax(var(--spacing-tile-s),1fr))] gap-tile-gap-s',
  m: 'grid-cols-[repeat(auto-fill,minmax(var(--spacing-tile-m),1fr))] gap-tile-gap-m',
  l: 'grid-cols-[repeat(auto-fill,minmax(var(--spacing-tile-l),1fr))] gap-6',
}

/**
 * The collection's list (EXPERIENCE.md, Count line, States, Loading more):
 * the count line, then the viewer's copies as rows or cover tiles at the
 * chosen size (`useCollectionDisplay`), one per copy in shelf order, from
 * `ShelfRowsProvider`. With none: First run, or No matches
 * while a search or filter is on. When a sentinel after the last row comes
 * within a screen of view, the next rows load with the progress line and the
 * rows shown stay usable; a failed load is tried again on the next approach.
 * A row or tile opens Book detail (`?book=`): pushing, or replacing while
 * `book` is open, whose rows carry the selection bar. In select mode
 * (`useSelection`) it carries its checkbox and ticks instead.
 */
export function CollectionList({ query, book }: { query: ShelfQuery; book: number | null }) {
  const t = useTranslations('collection')
  const root = useTranslations()
  const locale = useLocale()
  const { shelf, loading, loadMore } = useShelfRows()
  const { layout, size } = useCollectionDisplay()
  const { selecting, ticked, toggle } = useSelection()
  const sentinel = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const element = sentinel.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: '0px 0px 100% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Each answer gives a new `shelf`, so a sentinel still near asks again; a
  // failure leaves `shelf` as it was, so the retry waits for the next approach.
  useEffect(() => {
    if (near) loadMore()
  }, [near, shelf, loadMore])

  const narrowed = isNarrowed(query)
  const clear = (
    <TextLink href={clearHref(query)} replace scroll={false}>
      {t('clear')}
    </TextLink>
  )
  const values = activeValues(query, shelf.labels, t, locale).join(', ')
  const count = t('count', { n: shelf.total })
  const parts: ReactNode[] = narrowed ? [...(values ? [values] : []), count, clear] : [count]
  const lent = (person: string) => root('loans.lentMarker', { person })
  const opens = (row: ShelfRow) => ({
    href: shelfHref(query, { book: row.book.bookId }),
    replace: book !== null,
    open: row.book.bookId === book,
    select: selecting
      ? {
          ticked: ticked.has(row.copy.copyId),
          onToggle: () => toggle(row.copy.copyId, row.copy.loan !== null),
        }
      : undefined,
  })

  return (
    <>
      {loading && <ProgressLine label={root('progress.loading')} />}
      <p aria-live="polite" className="pt-1 pb-2 text-meta text-text-muted">
        {parts.map((part, i) => (
          <Fragment key={i}>
            {i > 0 && SEPARATOR}
            {part}
          </Fragment>
        ))}
      </p>
      {shelf.total === 0 ? (
        <div className="flex flex-col items-start gap-2 py-6">
          <p className="text-heading-group">{t(narrowed ? 'noMatch' : 'empty')}</p>
          {narrowed ? (
            clear
          ) : (
            <>
              <p className="text-body text-text-muted">{t('emptyRemark')}</p>
              <Link
                href="/scan"
                transitionTypes={['task-open']}
                className={`${buttonClass('primary')} mt-2 hidden items-center justify-center wide:inline-flex`}
              >
                {root('scan.open')}
              </Link>
            </>
          )}
        </div>
      ) : layout === 'covers' ? (
        <ul className={`grid ${GRID[size]}`}>
          {shelf.rows.map((row) => (
            <CoverTile key={row.copy.copyId} row={row} size={size} lent={lent} {...opens(row)} />
          ))}
        </ul>
      ) : (
        <ul>
          {shelf.rows.map((row) => (
            <BookRow
              key={row.copy.copyId}
              row={row}
              size={size}
              ordered={t('ordered')}
              lent={lent}
              {...opens(row)}
            />
          ))}
        </ul>
      )}
      <div ref={sentinel} aria-hidden />
    </>
  )
}
