import { helsinkiToday } from '@/fields/readingDates'
import { getEffectiveBooks } from '@/lib/books/effectiveBook'
import type { Context } from '@/lib/payload/context'
import { readingNow } from '@/lib/shelf/readingNow'
import { dustCandidates, readingLog, spending } from '@/lib/shelf/stats'

import { computeStats, pickDust, type Stats } from './computeStats'

/**
 * PRD FR-58: the viewer's Stats for `year` (missing or unknown: the current
 * Helsinki year), computed on every call from the `lib/shelf` readers (AD-7)
 * by the pure `computeStats()`. Nothing is stored or cached. Every logged and
 * priced Book, of every year, is hydrated through one `getEffectiveBooks()`,
 * so overrides apply to pages and authors; of the dust candidates only the
 * winner is (`readingNow()` hydrates its own).
 */
export async function getStats(ctx: Context, year?: number): Promise<Stats> {
  const [reading, log, priced, dust] = await Promise.all([
    readingNow(ctx),
    readingLog(ctx),
    spending(ctx),
    dustCandidates(ctx),
  ])
  const dustBook = pickDust(dust)?.bookId
  const ids = new Set([
    ...log.map((r) => r.bookId),
    ...priced.map((p) => p.bookId),
    ...(dustBook === undefined ? [] : [dustBook]),
  ])
  const books = await getEffectiveBooks(ctx, [...ids])
  return computeStats({ today: helsinkiToday(), year, reading, log, priced, dust }, books)
}
