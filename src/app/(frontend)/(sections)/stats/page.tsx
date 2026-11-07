import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { helsinkiToday } from '@/fields/readingDates'
import { logger } from '@/lib/errors'
import { requireUser } from '@/lib/payload/context'
import type { Stats } from '@/lib/stats/computeStats'
import { getStats } from '@/lib/stats/getStats'

import { markerSlotClass } from '../../components/ui/classes'
import { LoadFailed } from '../LoadFailed'
import { sinceDay, unreadFor } from '../readingLine'

import { YearSwitch } from './YearSwitch'

const groupHeading = 'pt-6 pb-1 text-heading-group text-text-muted ui-case'
/** DESIGN.md, Stats by month: month, markers, line; By year leaves the middle empty. */
const monthGrid = 'grid grid-cols-[auto_1fr_auto] items-center gap-x-3'

/** The `year` param: its first value when it is four digits, otherwise none (the current year). */
function yearParam(value: string | string[] | undefined): number | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first !== undefined && /^\d{4}$/.test(first) ? Number(first) : undefined
}

/** One Stats facts row: label left, value right in muted. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-body">
      <dt className="shrink-0 text-text">{label}</dt>
      <dd className="text-right text-text-muted">{children}</dd>
    </div>
  )
}

/**
 * Stats (EXPERIENCE.md, Stats; PRD FR-57, FR-58): `getStats()` for `?year=`,
 * formatted here and nothing computed. In order: Currently reading (each
 * Book a link to its detail on the collection, `/?book=`), the empty state,
 * the Year group with its switch, the big numbers, By month and Nerdy stats
 * (one column, side by side from 900px), By year and the undated line. A
 * part with nothing to show is absent; the Year group and the big numbers
 * always show. "Nothing read yet" when nothing is being read, no read Book
 * is undated and no year has a book or a price. A failed read, Load failed
 * alone.
 */
export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireUser()
  const year = yearParam((await searchParams).year)

  const stats = await getStats(ctx, year).catch((err: unknown): Stats | null => {
    logger().error({ err }, 'The stats failed to load')
    return null
  })

  const t = await getTranslations()
  const format = await getFormatter()

  if (stats === null) {
    return (
      <div className="flex flex-1 flex-col px-page-margin-phone wide:px-page-margin">
        <LoadFailed />
      </div>
    )
  }

  const today = helsinkiToday()
  const current = Number(today.slice(0, 4))
  const { year: shown } = stats

  const number = (n: number) => format.number(n)
  const euros = (cents: number) =>
    format.number(cents / 100, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    })
  const monthName = (month: number, style: 'short' | 'long') =>
    format.dateTime(new Date(Date.UTC(shown.year, month - 1, 15, 12)), { month: style })

  const anyYear = stats.byYear.some((y) => y.books > 0 || y.spent > 0)
  const empty = stats.reading.length === 0 && stats.undated === 0 && !anyYear

  type FactRow = { label: string; value: string }
  const facts = [
    shown.pagesPerDay !== null && {
      label: t('stats.pagesPerDay'),
      value: number(shown.pagesPerDay),
    },
    shown.daysPerBook !== null && {
      label: t('stats.daysPerBook'),
      value: number(shown.daysPerBook),
    },
    shown.quickest && {
      label: t('stats.quickest'),
      value: t('stats.bookDays', { title: shown.quickest.book.title, n: shown.quickest.days }),
    },
    shown.slowest && {
      label: t('stats.slowest'),
      value: t('stats.bookDays', { title: shown.slowest.book.title, n: shown.slowest.days }),
    },
    shown.thickest && {
      label: t('stats.thickest'),
      value: t('stats.bookPages', {
        title: shown.thickest.book.title,
        pages: number(shown.thickest.pages),
      }),
    },
    stats.dust && {
      label: t('stats.dust'),
      value: t('stats.bookUnread', {
        title: stats.dust.book.title,
        ...unreadFor(stats.dust.since, today),
      }),
    },
    shown.mostExpensive && {
      label: t('stats.mostExpensive'),
      value: t('stats.bookPrice', {
        title: shown.mostExpensive.book.title,
        price: euros(shown.mostExpensive.price),
      }),
    },
    shown.bestMonth && {
      label: t('stats.bestMonth'),
      value: t('stats.monthBooks', {
        month: monthName(shown.bestMonth.month, 'long'),
        n: shown.bestMonth.books,
      }),
    },
    shown.topAuthor && {
      label: t('stats.topAuthor'),
      value: t('stats.authorBooks', {
        name: shown.topAuthor.author.name,
        n: shown.topAuthor.books,
      }),
    },
  ].filter((fact): fact is FactRow => Boolean(fact))

  const big = [
    { value: number(shown.books), label: t('stats.books', { n: shown.books }) },
    { value: number(shown.pages), label: t('stats.pages', { n: shown.pages }) },
    { value: euros(shown.spent), label: t('stats.spent') },
    {
      value: format.number(shown.booksPerMonth, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
      label: t('stats.booksPerMonth'),
    },
  ]

  return (
    <div className="flex flex-1 flex-col px-page-margin-phone pb-6 wide:px-page-margin">
      {stats.reading.length > 0 && (
        <section>
          <h2 className="pt-4 pb-1 text-heading-group text-text-muted ui-case">
            {t('collection.readingNow')}
          </h2>
          <ul>
            {stats.reading.map(({ book, since }) => (
              <li key={book.bookId}>
                <Link
                  href={`/?book=${book.bookId}`}
                  prefetch={false}
                  className="flex items-center justify-between gap-3 py-1 text-body max-wide:min-h-tap"
                >
                  <span className="min-w-0 truncate text-text">{book.title}</span>
                  <span className="shrink-0 text-text-muted">
                    {t('collection.readingSince', {
                      date: format.dateTime(new Date(`${since}T12:00:00Z`), sinceDay(since, today)),
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {empty && (
        <div className="flex flex-col items-start gap-2 py-6">
          <p className="text-heading-group">{t('stats.nothingRead')}</p>
          <p className="text-body text-text-muted">{t('stats.nothingReadRemark')}</p>
        </div>
      )}

      <div className={`flex flex-wrap items-baseline gap-x-4 ${empty ? '' : 'pt-6'}`}>
        <h2 className="text-heading-group text-text-muted ui-case">
          {shown.year === current ? t('stats.thisYear') : String(shown.year)}
        </h2>
        {stats.years.length > 1 && (
          <YearSwitch years={stats.years} year={shown.year} current={current} />
        )}
      </div>

      <div className="flex flex-wrap gap-6 pt-2 wide:gap-7">
        {big.map(({ value, label }, i) => (
          <p key={i} className="flex flex-col">
            <span className="text-heading-section-phone text-text wide:text-heading-section">
              {value}
            </span>
            <span className="text-meta text-text-muted">{label}</span>
          </p>
        ))}
      </div>

      {(shown.books > 0 || facts.length > 0) && (
        <div className="wide:grid wide:grid-cols-2 wide:gap-x-7">
          {shown.books > 0 && (
            <section>
              <h2 className={groupHeading}>{t('stats.byMonth')}</h2>
              <div className={`${monthGrid} text-meta`}>
                {shown.months.map(({ month, books, pages }) => (
                  <div key={month} className="contents">
                    <span className="text-text-muted">{monthName(month, 'short')}</span>
                    {books > 0 ? (
                      <span aria-hidden className="flex flex-wrap gap-1">
                        {Array.from({ length: books }, (_, i) => (
                          <span key={i} className={`${markerSlotClass} bg-accent`} />
                        ))}
                      </span>
                    ) : (
                      <span className="text-text-dim">{t('stats.monthNone')}</span>
                    )}
                    <span className="text-right text-text-muted">
                      {books > 0 && t('stats.monthLine', { books, pages: number(pages) })}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {facts.length > 0 && (
            <section>
              <h2 className={groupHeading}>{t('stats.nerdy')}</h2>
              <dl>
                {facts.map(({ label, value }) => (
                  <Fact key={label} label={label}>
                    {value}
                  </Fact>
                ))}
              </dl>
            </section>
          )}
        </div>
      )}

      {anyYear && (
        <section>
          <h2 className={groupHeading}>{t('stats.byYear')}</h2>
          <div className={`${monthGrid} text-body`}>
            {stats.byYear.map((y) => (
              <div key={y.year} className="contents">
                <span className="text-text">{y.year}</span>
                <span />
                <span className="text-right text-text-muted">
                  {t('stats.yearLine', {
                    books: y.books,
                    pages: number(y.pages),
                    spent: euros(y.spent),
                  })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {stats.undated > 0 && (
        <p className="pt-2 text-meta text-text-muted">{t('stats.undated', { n: stats.undated })}</p>
      )}
    </div>
  )
}
