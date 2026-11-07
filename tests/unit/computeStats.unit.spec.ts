import { describe, expect, it } from 'vitest'

import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { Named } from '@/lib/payload/ref'
import type { DustCopy, LoggedRead, PricedCopy } from '@/lib/shelf/stats'
import { computeStats, type StatsInput } from '@/lib/stats/computeStats'

// FR-58's definitions, one case per row of the story's matrix (spec 10.5).

const TODAY = '2026-11-07'

const book = (
  bookId: number,
  pages: number | null = null,
  authors: Named[] = [],
): EffectiveBook => ({
  bookId,
  isbn13: null,
  visibility: 'shared',
  source: null,
  title: `Book ${bookId}`,
  subtitle: null,
  authors,
  series: null,
  seriesIndex: null,
  genres: [],
  themes: [],
  publisher: null,
  year: null,
  language: null,
  pages,
  description: null,
  coverUrl: null,
  overridden: [],
})

const read = (
  bookId: number,
  finishedAt: string | null,
  readingSince: string | null = null,
): LoggedRead => ({
  bookId,
  readingSince,
  finishedAt,
})

const run = (input: Partial<StatsInput>, books: EffectiveBook[] = []) =>
  computeStats(
    { today: TODAY, reading: [], log: [], priced: [], dust: [], ...input },
    new Map(books.map((b) => [b.bookId, b])),
  )

describe('computeStats', () => {
  it('counts a finished Book in the year of finishedAt and an undated one only as undated', () => {
    const stats = run({ log: [read(1, '2026-03-02'), read(2, '2025-12-31'), read(3, null)] }, [
      book(1),
      book(2),
      book(3),
    ])
    expect(stats.year.books).toBe(1)
    expect(stats.years).toEqual([2026, 2025])
    expect(stats.byYear.map((y) => [y.year, y.books])).toEqual([
      [2026, 1],
      [2025, 1],
    ])
    expect(stats.undated).toBe(1)
  })

  it('adds a Book without pages as a book but no pages, never Thickest', () => {
    const stats = run({ log: [read(1, '2026-03-02'), read(2, '2026-04-02')] }, [
      book(1, 300),
      book(2),
    ])
    expect(stats.year.books).toBe(2)
    expect(stats.year.pages).toBe(300)
    expect(stats.year.thickest).toEqual({ book: book(1, 300), pages: 300 })
    expect(run({ log: [read(2, '2026-04-02')] }, [book(2)]).year.thickest).toBeNull()
  })

  it('sums priced copies acquired in the year, ordered or owned', () => {
    const priced: PricedCopy[] = [
      { copyId: 1, bookId: 1, acquiredAt: '2026-01-05', price: 1290 },
      { copyId: 2, bookId: 2, acquiredAt: '2026-06-01', price: 2000 },
      { copyId: 3, bookId: 3, acquiredAt: '2025-12-31', price: 500 },
    ]
    const stats = run({ priced }, [book(1), book(2), book(3), book(4)])
    expect(stats.year.spent).toBe(3290)
    expect(stats.byYear).toEqual([
      { year: 2026, books: 0, pages: 0, spent: 3290 },
      { year: 2025, books: 0, pages: 0, spent: 500 },
    ])
  })

  it('divides by the months and days elapsed in the current year', () => {
    const log = Array.from({ length: 22 }, (_, i) =>
      read(i + 1, `2026-${String((i % 11) + 1).padStart(2, '0')}-01`),
    )
    const books = log.map((r) => book(r.bookId, 150))
    const { year } = run({ log }, books)
    expect(year.booksPerMonth).toBe(2)
    expect(year.pagesPerDay).toBe(10.6)
    expect(year.months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('divides by all of a past year', () => {
    const log = Array.from({ length: 24 }, (_, i) =>
      read(i + 1, `2025-${String((i % 12) + 1).padStart(2, '0')}-15`),
    )
    const books = log.map((r, i) => book(r.bookId, i === 0 ? 400 : 300))
    const { year } = run({ log, year: 2025 }, books)
    expect(year.year).toBe(2025)
    expect(year.booksPerMonth).toBe(2)
    expect(year.pagesPerDay).toBe(20)
    expect(year.months).toHaveLength(12)
  })

  it('needs both dates for Days a book, Quickest and Slowest', () => {
    const log = [
      read(1, '2026-01-11', '2026-01-01'),
      read(2, '2026-01-21', '2026-01-01'),
      read(3, '2026-01-02'),
    ]
    const { year } = run({ log }, [book(1), book(2), book(3)])
    expect(year.daysPerBook).toBe(15)
    expect(year.quickest).toEqual({ book: book(1), days: 10 })
    expect(year.slowest).toEqual({ book: book(2), days: 20 })
  })

  it('breaks Quickest and Slowest ties by the earlier finish', () => {
    const log = [
      read(1, '2026-03-10', '2026-03-05'),
      read(2, '2026-02-01', '2026-01-27'),
      read(3, '2026-05-01', '2026-04-01'),
      read(4, '2026-04-01', '2026-03-02'),
    ]
    const { year } = run({ log }, [book(1), book(2), book(3), book(4)])
    expect(year.quickest?.book.bookId).toBe(2)
    expect(year.slowest?.book.bookId).toBe(4)
  })

  it('breaks Thickest by the earlier finish and Most expensive by the earlier acquiredAt, then copy id', () => {
    const log = [read(1, '2026-05-01'), read(2, '2026-04-01')]
    const priced: PricedCopy[] = [
      { copyId: 9, bookId: 1, acquiredAt: '2026-03-01', price: 3000 },
      { copyId: 8, bookId: 2, acquiredAt: '2026-03-01', price: 3000 },
      { copyId: 7, bookId: 1, acquiredAt: '2026-04-01', price: 3000 },
    ]
    const { year } = run({ log, priced }, [book(1, 500), book(2, 500)])
    expect(year.thickest?.book.bookId).toBe(2)
    expect(year.mostExpensive).toEqual({ book: book(2, 500), price: 3000 })
  })

  it('picks the best month by books, then pages, then the earlier month', () => {
    const log = [
      read(1, '2026-03-01'),
      read(2, '2026-03-02'),
      read(3, '2026-05-01'),
      read(4, '2026-05-02'),
      read(5, '2026-01-01'),
    ]
    const more = [book(1, 200), book(2, 200), book(3, 300), book(4, 300), book(5, 900)]
    expect(run({ log }, more).year.bestMonth).toEqual({ month: 5, books: 2 })
    const equal = [book(1, 300), book(2, 300), book(3, 300), book(4, 300), book(5, 900)]
    expect(run({ log }, equal).year.bestMonth).toEqual({ month: 3, books: 2 })
  })

  it('counts every effective author, needs 2 Books and breaks ties by name', () => {
    const waltari = { id: 1, name: 'Waltari, Mika' }
    const kivi = { id: 2, name: 'Kivi, Aleksis' }
    const linna = { id: 3, name: 'Linna, Väinö' }
    const log = [
      read(1, '2026-01-01'),
      read(2, '2026-02-01'),
      read(3, '2026-03-01'),
      read(4, '2026-04-01'),
    ]
    const books = [
      book(1, null, [kivi, waltari]),
      book(2, null, [kivi]),
      book(3, null, [waltari]),
      book(4, null, [linna]),
    ]
    expect(run({ log }, books).year.topAuthor).toEqual({ author: kivi, books: 2 })
    const single = [book(1, null, [kivi]), book(2, null, [waltari]), book(3, null, [linna])]
    expect(run({ log: log.slice(0, 3) }, single).year.topAuthor).toBeNull()
  })

  it('picks the dust Book by the oldest acquiredAt, then the copy created first', () => {
    // SQL already leaves out ordered copies and Books being read or read.
    const dust: DustCopy[] = [
      { copyId: 1, bookId: 1, acquiredAt: '2019-05-01', createdAt: '2020-01-02T00:00:00.000Z' },
      { copyId: 2, bookId: 2, acquiredAt: '2019-05-01', createdAt: '2020-01-01T00:00:00.000Z' },
      { copyId: 3, bookId: 1, acquiredAt: '2020-01-01', createdAt: '2019-01-01T00:00:00.000Z' },
    ]
    expect(run({ dust }, [book(2)]).dust).toEqual({ book: book(2), since: '2019-05-01' })
  })

  it('uses the current year for a missing or unknown year and an existing one as given', () => {
    const log = [read(1, '2024-06-01')]
    expect(run({ log }, [book(1)]).year.year).toBe(2026)
    expect(run({ log, year: 2031 }, [book(1)]).year.year).toBe(2026)
    expect(run({ log, year: 2019 }, [book(1)]).year.year).toBe(2026)
    expect(run({ log, year: 2024 }, [book(1)]).year.year).toBe(2024)
  })

  it('lists the years with a finished Book or a priced copy plus the current one, newest first', () => {
    const stats = run(
      {
        log: [read(1, '2024-06-01'), read(2, '2026-06-01')],
        priced: [{ copyId: 1, bookId: 3, acquiredAt: '2022-02-02', price: 100 }],
      },
      [book(1), book(2), book(3)],
    )
    expect(stats.years).toEqual([2026, 2024, 2022])
    expect(stats.byYear.map((y) => y.year)).toEqual([2026, 2024, 2022])
    expect(run({ log: [read(1, '2024-06-01')] }, [book(1)]).years).toEqual([2026, 2024])
  })

  it('returns zeros and nulls with no rows', () => {
    expect(run({})).toEqual({
      reading: [],
      years: [2026],
      year: {
        year: 2026,
        books: 0,
        pages: 0,
        spent: 0,
        booksPerMonth: 0,
        months: Array.from({ length: 11 }, (_, i) => ({ month: i + 1, books: 0, pages: 0 })),
        pagesPerDay: null,
        daysPerBook: null,
        quickest: null,
        slowest: null,
        thickest: null,
        mostExpensive: null,
        bestMonth: null,
        topAuthor: null,
      },
      byYear: [{ year: 2026, books: 0, pages: 0, spent: 0 }],
      undated: 0,
      dust: null,
    })
  })
})
