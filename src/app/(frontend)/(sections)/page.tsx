import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'

import { logger } from '@/lib/errors'
import { requireUser } from '@/lib/payload/context'
import { getShelfRows } from '@/lib/shelf/getShelfRows'
import { parseShelfQuery, SHELF_PAGE_SIZE, type ShelfRows } from '@/lib/shelf/query'

import { buttonClass } from '../components/Button'
import { TextLink } from '../components/Link'

import { BookRow } from './BookRow'
import { CollectionTools } from './CollectionTools'
import { activeValues, clearHref, isNarrowed } from './countLine'
import { LoadFailed } from './LoadFailed'

/** Between the count line's parts (EXPERIENCE.md, Count line). */
const SEPARATOR = ' · '

/**
 * The collection (EXPERIENCE.md, Collection controls and States): the tools
 * row, the count line and the first page of the viewer's copies at size m,
 * one row per copy in shelf order. With none: First run, or No matches while
 * a search or filter is on. A failed read shows Load failed.
 */
export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireUser()
  const t = await getTranslations('collection')
  const scan = await getTranslations('scan')
  const { query } = parseShelfQuery(await searchParams)

  let shelf: ShelfRows | null = null
  try {
    shelf = await getShelfRows(ctx, query, { offset: 0, limit: SHELF_PAGE_SIZE })
  } catch (err) {
    logger().error({ err }, 'The collection failed to load')
  }

  const narrowed = isNarrowed(query)
  const clear = (
    <TextLink href={clearHref(query)} replace scroll={false}>
      {t('clear')}
    </TextLink>
  )

  const body = (shelf: ShelfRows) => {
    const values = activeValues(query, shelf.labels, t).join(', ')
    const count = t('count', { n: shelf.total })
    const parts: ReactNode[] = narrowed ? [...(values ? [values] : []), count, clear] : [count]
    return (
      <>
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
                  {scan('open')}
                </Link>
              </>
            )}
          </div>
        ) : (
          <ul>
            {shelf.rows.map((row) => (
              <BookRow key={row.copy.copyId} row={row} ordered={t('ordered')} />
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <div className="px-page-margin-phone wide:px-page-margin">
      <CollectionTools />
      {shelf ? body(shelf) : <LoadFailed />}
    </div>
  )
}
