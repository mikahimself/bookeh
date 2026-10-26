import { getFormatter, getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { getEffectiveBooks, type EffectiveBook, type Named } from '@/lib/books/effectiveBook'
import { listLocations, type LocationOption } from '@/lib/copies/locations'
import { logger } from '@/lib/errors'
import { openLoans, returnedLoans, type OpenLoan, type ReturnedLoan } from '@/lib/loans/loans'
import type { Context } from '@/lib/payload/context'
import { requireUser } from '@/lib/payload/context'
import { parseShelfQuery } from '@/lib/shelf/query'

import { devicePrefs } from '../../prefs'
import { BookDetail } from '../BookDetail'
import { ReturnLoan } from '../CopyLine'
import { LoadFailed } from '../LoadFailed'
import { ShelfActionsProvider } from '../ShelfRows'

import { LoanRow } from './LoanRow'
import { LoansOrder } from './LoansOrder'
import { RefreshOnUndo } from './RefreshOnUndo'

type LoanItem = { loan: OpenLoan; book: EffectiveBook }
type ReturnedItem = { loan: ReturnedLoan; book: EffectiveBook }

/**
 * The open loans in `openLoans()` order and the returned ones in
 * `returnedLoans()` order, with their Books from one read; a loan whose Book
 * the viewer can no longer read is left out.
 */
async function loanItems(ctx: Context): Promise<{ open: LoanItem[]; returned: ReturnedItem[] }> {
  const [open, returned] = await Promise.all([openLoans(ctx), returnedLoans(ctx)])
  const books = await getEffectiveBooks(ctx, [
    ...new Set([...open, ...returned].map((loan) => loan.bookId)),
  ])
  const withBook = <L extends { bookId: number }>(loans: L[]) =>
    loans.flatMap((loan) => {
      const book = books.get(loan.bookId)
      return book ? [{ loan, book }] : []
    })
  return { open: withBook(open), returned: withBook(returned) }
}

/** The items grouped by borrower (`person.id`), the groups by name in `locale`, each keeping the items' order. */
function byBorrower(items: LoanItem[], locale: string): { person: Named; items: LoanItem[] }[] {
  const groups = new Map<number, { person: Named; items: LoanItem[] }>()
  for (const item of items) {
    const { person } = item.loan
    const group = groups.get(person.id)
    if (group) group.items.push(item)
    else groups.set(person.id, { person, items: [item] })
  }
  const collator = new Intl.Collator(locale)
  return [...groups.values()].sort((a, b) => collator.compare(a.person.name, b.person.name))
}

/**
 * Loans (EXPERIENCE.md, Loans and States; FR-37): the viewer's open loans,
 * one row per loan, in the order the by person / by date switch chose
 * (`LoansOrder`, a device preference read here so the first paint is right).
 * By person: a group per borrower, headed by the name as typed, the groups
 * alphabetical in the interface locale, each the longest out first. By date:
 * one list, the longest out first. With none, the switch and "Nothing lent".
 * Each open row has Returned (`ReturnLoan`), which closes the loan today;
 * the refresh moves the row to the returned group, and a toast Undo
 * (`RefreshOnUndo`) moves it back. Under either order, and under Nothing
 * lent, the returned group: the returned loans newest first, each
 * "{person} · {from} to {to}", rendered once outside the switch. A failed
 * read, Load failed alone. Books come from
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

  const [loans, locations] = await Promise.all([
    loanItems(ctx).catch((err: unknown): Awaited<ReturnType<typeof loanItems>> | null => {
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
  const prefs = await devicePrefs()
  const locale = await getLocale()

  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: 'medium' })
  const row = ({ loan, book: lent }: LoanItem | ReturnedItem, line: string, action?: ReactNode) => (
    <LoanRow
      key={loan.loanId}
      book={lent}
      line={line}
      href={`/loans?book=${loan.bookId}`}
      replace={book !== null}
      open={loan.bookId === book}
      action={action}
    />
  )
  const openRow = (item: LoanItem, line: string) =>
    row(item, line, <ReturnLoan loanId={item.loan.loanId} />)
  const nothingLent = (
    <div className="flex flex-col items-start gap-2 py-6">
      <p className="text-heading-group">{t('nothingLent')}</p>
      <p className="text-body text-text-muted">{t('nothingLentRemark')}</p>
    </div>
  )

  return (
    <div className="flex flex-1 flex-col px-page-margin-phone wide:px-page-margin">
      <ShelfActionsProvider>
        <RefreshOnUndo />
        <div className="wide:flex wide:flex-1 wide:gap-6">
          <section tabIndex={-1} className="min-w-0 flex-1">
            {loans === null ? (
              <LoadFailed />
            ) : loans.open.length === 0 ? (
              <LoansOrder initial={prefs.loans} byPerson={nothingLent} byDate={nothingLent} />
            ) : (
              <LoansOrder
                initial={prefs.loans}
                byPerson={byBorrower(loans.open, locale).map(({ person, items: lent }) => (
                  <div key={person.id} className="pt-4">
                    <h2 className="text-heading-group text-text-muted">{person.name}</h2>
                    <ul>
                      {lent.map((item) =>
                        openRow(item, t('sinceDate', { date: day(item.loan.since) })),
                      )}
                    </ul>
                  </div>
                ))}
                byDate={
                  <ul>
                    {loans.open.map((item) =>
                      openRow(
                        item,
                        t('since', {
                          person: item.loan.person.name,
                          date: day(item.loan.since),
                        }),
                      ),
                    )}
                  </ul>
                }
              />
            )}
            {loans !== null && loans.returned.length > 0 && (
              <div className="pt-4">
                <h2 className="text-heading-group text-text-muted ui-case">{t('returnedGroup')}</h2>
                <ul>
                  {loans.returned.map((item) =>
                    row(
                      item,
                      t('lentBetween', {
                        person: item.loan.person.name,
                        from: day(item.loan.lentOn),
                        to: day(item.loan.returnedOn),
                      }),
                    ),
                  )}
                </ul>
              </div>
            )}
          </section>
          {book !== null && (
            <BookDetail ctx={ctx} bookId={book} back="/loans" locations={locations} />
          )}
        </div>
      </ShelfActionsProvider>
    </div>
  )
}
