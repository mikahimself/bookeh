import { getFormatter, getTranslations } from 'next-intl/server'

import { getEffectiveBooks, type EffectiveBook } from '@/lib/books/effectiveBook'
import { listLocations, type LocationOption } from '@/lib/copies/locations'
import { logger } from '@/lib/errors'
import { openLoans, type OpenLoan } from '@/lib/loans/loans'
import type { Context } from '@/lib/payload/context'
import { requireUser } from '@/lib/payload/context'
import { parseShelfQuery } from '@/lib/shelf/query'

import { BookDetail } from '../BookDetail'
import { LoadFailed } from '../LoadFailed'
import { ShelfActionsProvider } from '../ShelfRows'

import { LoanRow } from './LoanRow'

type LoanItem = { loan: OpenLoan; book: EffectiveBook }

/** The open loans in `openLoans()` order with their Books; one the viewer can no longer read is left out. */
async function loanItems(ctx: Context): Promise<LoanItem[]> {
  const loans = await openLoans(ctx)
  const books = await getEffectiveBooks(ctx, [...new Set(loans.map((loan) => loan.bookId))])
  return loans.flatMap((loan) => {
    const book = books.get(loan.bookId)
    return book ? [{ loan, book }] : []
  })
}

/**
 * Loans (EXPERIENCE.md, Loans and States), by date: the viewer's open loans
 * as one list, the longest out first (FR-37), one row per loan; with none,
 * "Nothing lent"; a failed read, Load failed. Books come from
 * `getEffectiveBooks()` and are never sorted or filtered on. With `?book=`,
 * the collection's Book detail beside the list from 900px and as the sheet on
 * the phone, closing back to `/loans`; it gets the viewer's locations for
 * Move, none when that read fails. Its actions report through `afterAction`,
 * which with no rows mounted refreshes this render, so the list follows a
 * Lend or a Returned.
 */
export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireUser()
  const { book } = parseShelfQuery(await searchParams)

  const [items, locations] = await Promise.all([
    loanItems(ctx).catch((err: unknown): LoanItem[] | null => {
      logger().error({ err }, 'The loans failed to load')
      return null
    }),
    listLocations(ctx).catch((err: unknown): LocationOption[] => {
      logger().error({ err }, 'The locations failed to load')
      return []
    }),
  ])

  const t = await getTranslations('loans')
  const format = await getFormatter()

  return (
    <div className="flex flex-1 flex-col px-page-margin-phone wide:px-page-margin">
      <ShelfActionsProvider>
        <div className="wide:flex wide:flex-1 wide:gap-6">
          <div className="min-w-0 flex-1">
            {items === null ? (
              <LoadFailed />
            ) : items.length === 0 ? (
              <div className="flex flex-col items-start gap-2 py-6">
                <p className="text-heading-group">{t('nothingLent')}</p>
                <p className="text-body text-text-muted">{t('nothingLentRemark')}</p>
              </div>
            ) : (
              <ul>
                {items.map(({ loan, book: lent }) => (
                  <LoanRow
                    key={loan.loanId}
                    book={lent}
                    line={t('since', {
                      person: loan.person.name,
                      date: format.dateTime(new Date(`${loan.since}T12:00:00Z`), {
                        dateStyle: 'medium',
                      }),
                    })}
                    href={`/loans?book=${loan.bookId}`}
                    replace={book !== null}
                    open={loan.bookId === book}
                  />
                ))}
              </ul>
            )}
          </div>
          {book !== null && (
            <BookDetail ctx={ctx} bookId={book} back="/loans" locations={locations} />
          )}
        </div>
      </ShelfActionsProvider>
    </div>
  )
}
