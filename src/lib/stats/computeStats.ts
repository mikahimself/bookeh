import { finishedDays } from '@/fields/readingDates'
import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { Named } from '@/lib/payload/ref'
import type { ReadingBook } from '@/lib/shelf/query'
import type { DustCopy, LoggedRead, PricedCopy } from '@/lib/shelf/stats'

// Spine, Structural Seed (Shared shapes, `src/lib/stats`).

export type BookDays = { book: EffectiveBook; days: number }

export type YearStats = {
  year: number
  books: number
  pages: number
  spent: number // euro cents
  booksPerMonth: number // books ÷ months elapsed, one decimal
  months: { month: number; books: number; pages: number }[] // 1 to 12, up to the current month in the current year
  pagesPerDay: number | null // one decimal; null when no finished Book has pages
  daysPerBook: number | null // one decimal; null when no finished Book has both dates
  quickest: BookDays | null
  slowest: BookDays | null
  thickest: { book: EffectiveBook; pages: number } | null
  mostExpensive: { book: EffectiveBook; price: number } | null
  bestMonth: { month: number; books: number } | null // most books, then most pages, then the earlier month
  topAuthor: { author: Named; books: number } | null // at least 2; ties by name (fi collation), then author id
}

export type Stats = {
  reading: ReadingBook[]
  years: number[] // with a finished Book or a priced copy, plus the current year, newest first
  year: YearStats
  byYear: { year: number; books: number; pages: number; spent: number }[] // newest first
  undated: number // read Books with no finishedAt
  dust: { book: EffectiveBook; since: string } | null // since: the earliest owned copy's acquiredAt
}

export type StatsInput = {
  today: string // YYYY-MM-DD, Europe/Helsinki
  year?: number
  reading: ReadingBook[]
  log: LoggedRead[]
  priced: PricedCopy[]
  dust: DustCopy[]
}

type Finished = { book: EffectiveBook; finishedAt: string; readingSince: string | null }

const round1 = (x: number) => Math.round(x * 10) / 10
const yearOf = (date: string) => Number(date.slice(0, 4))
const monthOf = (date: string) => Number(date.slice(5, 7))
const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
const dayOfYear = (date: string) =>
  (Date.UTC(yearOf(date), monthOf(date) - 1, Number(date.slice(8, 10))) -
    Date.UTC(yearOf(date), 0, 1)) /
    86_400_000 +
  1

const authorOrder = new Intl.Collator('fi')

/** The first item by `before`, or null. */
function best<T>(items: readonly T[], before: (a: T, b: T) => boolean): T | null {
  let winner: T | null = null
  for (const item of items) if (winner === null || before(item, winner)) winner = item
  return winner
}

/**
 * FR-58, Most dust collected: the owned copy with the oldest `acquiredAt`,
 * then the one created first, then the lower copy id. Its Book is the winner,
 * and its `acquiredAt` that Book's earliest owned copy.
 */
export function pickDust(dust: readonly DustCopy[]): DustCopy | null {
  return best(
    dust,
    (a, b) =>
      a.acquiredAt < b.acquiredAt ||
      (a.acquiredAt === b.acquiredAt &&
        (a.createdAt < b.createdAt || (a.createdAt === b.createdAt && a.copyId < b.copyId))),
  )
}

/** Earlier finish, then lower Book id: the tie rule of Quickest, Slowest and Thickest. */
const earlierFinish = (a: Finished, b: Finished) =>
  a.finishedAt < b.finishedAt || (a.finishedAt === b.finishedAt && a.book.bookId < b.book.bookId)

function yearStats(
  year: number,
  today: string,
  finished: readonly Finished[],
  priced: readonly PricedCopy[],
  books: ReadonlyMap<number, EffectiveBook>,
): YearStats {
  const done = finished.filter((f) => yearOf(f.finishedAt) === year)
  const bought = priced.filter((p) => yearOf(p.acquiredAt) === year)
  const current = year === yearOf(today)
  const monthsElapsed = current ? monthOf(today) : 12
  const daysElapsed = current ? dayOfYear(today) : isLeap(year) ? 366 : 365

  const pages = done.reduce((sum, f) => sum + (f.book.pages ?? 0), 0)
  const months = Array.from({ length: monthsElapsed }, (_, i) => {
    const inMonth = done.filter((f) => monthOf(f.finishedAt) === i + 1)
    return {
      month: i + 1,
      books: inMonth.length,
      pages: inMonth.reduce((sum, f) => sum + (f.book.pages ?? 0), 0),
    }
  })

  const timed = done.flatMap((f) =>
    f.readingSince ? [{ ...f, days: finishedDays(f.readingSince, f.finishedAt) }] : [],
  )
  const quickest = best(
    timed,
    (a, b) => a.days < b.days || (a.days === b.days && earlierFinish(a, b)),
  )
  const slowest = best(
    timed,
    (a, b) => a.days > b.days || (a.days === b.days && earlierFinish(a, b)),
  )

  const paged = done.flatMap((f) => (f.book.pages ? [{ ...f, pages: f.book.pages }] : []))
  const thickest = best(
    paged,
    (a, b) => a.pages > b.pages || (a.pages === b.pages && earlierFinish(a, b)),
  )

  const priceable = bought.filter((p) => books.has(p.bookId))
  const expensive = best(
    priceable,
    (a, b) =>
      a.price > b.price ||
      (a.price === b.price &&
        (a.acquiredAt < b.acquiredAt || (a.acquiredAt === b.acquiredAt && a.copyId < b.copyId))),
  )

  const bestMonth = best(
    months.filter((m) => m.books > 0),
    (a, b) => a.books > b.books || (a.books === b.books && a.pages > b.pages),
  )

  const byAuthor = new Map<number, { author: Named; books: number }>()
  for (const f of done) {
    for (const author of new Map(f.book.authors.map((a) => [a.id, a])).values()) {
      const entry = byAuthor.get(author.id) ?? { author, books: 0 }
      entry.books += 1
      byAuthor.set(author.id, entry)
    }
  }
  const topAuthor = best(
    [...byAuthor.values()].filter((a) => a.books >= 2),
    (a, b) => {
      if (a.books !== b.books) return a.books > b.books
      const byName = authorOrder.compare(a.author.name, b.author.name)
      return byName !== 0 ? byName < 0 : a.author.id < b.author.id
    },
  )

  return {
    year,
    books: done.length,
    pages,
    spent: bought.reduce((sum, p) => sum + p.price, 0),
    booksPerMonth: round1(done.length / monthsElapsed),
    months,
    pagesPerDay: paged.length > 0 ? round1(pages / daysElapsed) : null,
    daysPerBook:
      timed.length > 0 ? round1(timed.reduce((sum, t) => sum + t.days, 0) / timed.length) : null,
    quickest: quickest && { book: quickest.book, days: quickest.days },
    slowest: slowest && { book: slowest.book, days: slowest.days },
    thickest: thickest && { book: thickest.book, pages: thickest.pages },
    mostExpensive: expensive && { book: books.get(expensive.bookId)!, price: expensive.price },
    bestMonth: bestMonth && { month: bestMonth.month, books: bestMonth.books },
    topAuthor,
  }
}

/**
 * PRD FR-58's definitions over the `lib/shelf` readers' rows, pure. A row
 * whose Book is not in `books` is skipped everywhere except `spent`, a sum of
 * prices. A stat with no candidate is null. A missing year, or one not in
 * `years`, means the current year of `today`.
 */
export function computeStats(input: StatsInput, books: ReadonlyMap<number, EffectiveBook>): Stats {
  const { today, log, priced } = input
  const currentYear = yearOf(today)

  const finished: Finished[] = []
  let undated = 0
  for (const row of log) {
    const book = books.get(row.bookId)
    if (!book) continue
    if (row.finishedAt === null) undated += 1
    else finished.push({ book, finishedAt: row.finishedAt, readingSince: row.readingSince })
  }

  const years = [
    ...new Set([
      currentYear,
      ...finished.map((f) => yearOf(f.finishedAt)),
      ...priced.map((p) => yearOf(p.acquiredAt)),
    ]),
  ].sort((a, b) => b - a)
  const year = input.year !== undefined && years.includes(input.year) ? input.year : currentYear

  const byYear = years.map((y) => {
    const done = finished.filter((f) => yearOf(f.finishedAt) === y)
    return {
      year: y,
      books: done.length,
      pages: done.reduce((sum, f) => sum + (f.book.pages ?? 0), 0),
      spent: priced.filter((p) => yearOf(p.acquiredAt) === y).reduce((sum, p) => sum + p.price, 0),
    }
  })

  const dustCopy = pickDust(input.dust)
  const dustBook = dustCopy && books.get(dustCopy.bookId)

  return {
    reading: input.reading,
    years,
    year: yearStats(year, today, finished, priced, books),
    byYear,
    undated,
    dust: dustCopy && dustBook ? { book: dustBook, since: dustCopy.acquiredAt } : null,
  }
}
