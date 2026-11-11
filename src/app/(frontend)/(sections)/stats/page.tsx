import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'

import { helsinkiToday } from '@/fields/readingDates'
import { logger } from '@/lib/errors'
import { requireUser } from '@/lib/payload/context'
import type { Stats } from '@/lib/stats/computeStats'
import { getStats } from '@/lib/stats/getStats'

import { LoadFailed } from '../LoadFailed'
import { sinceDay, unreadFor } from '../readingLine'

import { NerdyIcon, type NerdyKind } from './NerdyIcon'
import { tileNumberStep, type TileNumberStep } from './tileNumberStep'
import { YearSwitch } from './YearSwitch'

type FactRow = { kind: NerdyKind; label: string; title: string; value: string }

/** Whole class names, so Tailwind sees them. */
const tileNumberClass: Record<TileNumberStep, string> = {
  xl: 'text-tile-number-xl',
  l: 'text-tile-number-l',
  m: 'text-tile-number-m',
  s: 'text-tile-number-s',
}

const groupHeading = 'pt-6 pb-1 text-heading-group text-text-muted ui-case'
/** DESIGN.md, Stats by month: month, markers, line; By year leaves the middle empty. */
const monthGrid = 'grid grid-cols-[auto_1fr_auto] items-center gap-x-3'

/** The `year` param: its first value when it is four digits, otherwise none (the current year). */
function yearParam(value: string | string[] | undefined): number | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first !== undefined && /^\d{4}$/.test(first) ? Number(first) : undefined
}

/** One Nerdy stats row: icon, then label, title and value lines (DESIGN.md, Stats facts). */
function Fact({ kind, label, title, value }: FactRow) {
  return (
    <li className="flex items-start gap-4 py-2">
      <NerdyIcon kind={kind} />
      <div className="min-w-0">
        <p className="text-meta text-text-muted">{label}</p>
        <p className="text-title text-text">{title}</p>
        <p className="text-meta text-text-muted">{value}</p>
      </div>
    </li>
  )
}

/**
 * Stats (EXPERIENCE.md, Stats; PRD FR-57, FR-58): `getStats()` for `?year=`,
 * formatted here and nothing computed. In order: Currently reading (each
 * Book a link to its detail on the collection, `/?book=`), the empty state,
 * the Year group with its switch, the tiles, By month and Nerdy stats
 * (one column, side by side from 900px; the tiles two by two, four in a row from there), By year and the undated line. A
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
  const monthName = (month: number, style: 'narrow' | 'long') =>
    format.dateTime(new Date(Date.UTC(shown.year, month - 1, 15, 12)), { month: style })

  const anyYear = stats.byYear.some((y) => y.books > 0 || y.spent > 0)
  const empty = stats.reading.length === 0 && stats.undated === 0 && !anyYear

  const facts = [
    shown.quickest && {
      kind: 'quickest',
      label: t('stats.quickest'),
      title: shown.quickest.book.title,
      value: t('stats.bookDays', { n: shown.quickest.days }),
    },
    shown.slowest && {
      kind: 'slowest',
      label: t('stats.slowest'),
      title: shown.slowest.book.title,
      value: t('stats.bookDays', { n: shown.slowest.days }),
    },
    shown.thickest && {
      kind: 'thickest',
      label: t('stats.thickest'),
      title: shown.thickest.book.title,
      value: t('stats.bookPages', { pages: shown.thickest.pages }),
    },
    stats.dust && {
      kind: 'dust',
      label: t('stats.dust'),
      title: stats.dust.book.title,
      value: t('stats.bookUnread', unreadFor(stats.dust.since, today)),
    },
    shown.mostExpensive && {
      kind: 'mostExpensive',
      label: t('stats.mostExpensive'),
      title: shown.mostExpensive.book.title,
      value: euros(shown.mostExpensive.price),
    },
    shown.bestMonth && {
      kind: 'bestMonth',
      label: t('stats.bestMonth'),
      title: monthName(shown.bestMonth.month, 'long'),
      value: t('stats.monthBooks', { n: shown.bestMonth.books }),
    },
    shown.topAuthor && {
      kind: 'topAuthor',
      label: t('stats.topAuthor'),
      title: shown.topAuthor.author.name,
      value: t('stats.authorBooks', { n: shown.topAuthor.books }),
    },
  ].filter((fact): fact is FactRow => Boolean(fact))
  const hasFacts = facts.length > 0 || shown.pagesPerDay !== null || shown.daysPerBook !== null

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
  const tileStep = tileNumberStep(big.map((b) => b.value))

  const stat = (value: number | null, label: string) =>
    value !== null && (
      <p className="flex flex-col">
        <span className="text-stat-number text-text">{number(value)}</span>
        <span className="text-meta text-text-muted">{label}</span>
      </p>
    )

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

      <div className="grid grid-cols-2 gap-2 pt-2 wide:grid-cols-4">
        {big.map(({ value, label }, i) => (
          <p
            key={i}
            className="flex aspect-square flex-col justify-between overflow-hidden bg-accent-fill p-4 text-on-fill"
          >
            <span className={`whitespace-nowrap ${tileNumberClass[tileStep]}`}>{value}</span>
            <span className="overflow-hidden text-title whitespace-nowrap">{label}</span>
          </p>
        ))}
      </div>

      {(shown.books > 0 || hasFacts) && (
        <div className="wide:grid wide:grid-cols-2 wide:gap-x-7">
          {shown.books > 0 && (
            <section>
              <h2 className={groupHeading}>{t('stats.byMonth')}</h2>
              <div className="flex gap-1 pt-2">
                {Array.from({ length: 12 }, (_, i) => {
                  const month = i + 1
                  const { books, pages } = shown.months.find((m) => m.month === month) ?? {
                    books: 0,
                    pages: 0,
                  }
                  const future =
                    books === 0 && shown.year === current && month > Number(today.slice(5, 7))
                  return (
                    <div
                      key={month}
                      role={future ? undefined : 'img'}
                      aria-hidden={future || undefined}
                      aria-label={
                        future
                          ? undefined
                          : t('stats.monthLabel', {
                              month: monthName(month, 'long'),
                              n: books,
                              pages,
                            })
                      }
                      className="flex flex-1 flex-col items-center gap-1"
                    >
                      <div className="flex min-h-chart-column flex-col-reverse items-center gap-chart-gap">
                        {books > 0
                          ? Array.from({ length: books }, (_, i) => (
                              <span key={i} aria-hidden className="size-chart-marker bg-accent" />
                            ))
                          : !future && (
                              <span
                                aria-hidden
                                className="h-stroke-control w-chart-marker bg-border"
                              />
                            )}
                      </div>
                      <span
                        aria-hidden
                        className={`text-label ${future ? 'text-text-dim' : 'text-text-muted'}`}
                      >
                        {monthName(month, 'narrow')}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          {hasFacts && (
            <section>
              <h2 className={groupHeading}>{t('stats.nerdy')}</h2>
              {(shown.pagesPerDay !== null || shown.daysPerBook !== null) && (
                <div className="flex flex-wrap gap-x-6 gap-y-2 py-2">
                  {stat(shown.pagesPerDay, t('stats.pagesPerDay'))}
                  {stat(shown.daysPerBook, t('stats.daysPerBook'))}
                </div>
              )}
              <ul className="flex flex-col">
                {facts.map((fact) => (
                  <Fact key={fact.kind} {...fact} />
                ))}
              </ul>
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
