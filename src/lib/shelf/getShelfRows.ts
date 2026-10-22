import { getEffectiveBooks } from '@/lib/books/effectiveBook'
import { type CopyLine, getHoldings } from '@/lib/books/holdings'
import type { Context } from '@/lib/payload/context'

import { shelfLabels } from './labels'
import type { ShelfQuery, ShelfRange, ShelfRows } from './query'
import { shelfIds } from './shelfIds'

/**
 * Spine, AD-7: the one hydrated shelf read, for the first page and every
 * later range. Rows keep `shelfIds`' order and `total` is its count; a copy
 * gone between the reads (or a Book no longer readable) drops its row. Each
 * reader runs once over the distinct Book ids.
 */
export async function getShelfRows(
  ctx: Context,
  query: ShelfQuery,
  range: ShelfRange,
): Promise<ShelfRows> {
  const [{ ids, total }, labels] = await Promise.all([
    shelfIds(ctx, query, range),
    shelfLabels(ctx, query.filters),
  ])
  const bookIds = [...new Set(ids.map((id) => id.bookId))]
  const [books, holdings] = await Promise.all([
    getEffectiveBooks(ctx, bookIds),
    getHoldings(ctx, bookIds),
  ])

  const copies = new Map<number, CopyLine>()
  for (const { copies: lines } of holdings.values()) {
    for (const line of lines) copies.set(line.copyId, line)
  }

  const rows = ids.flatMap(({ copyId, bookId }) => {
    const copy = copies.get(copyId)
    const book = books.get(bookId)
    return copy && book ? [{ copy, book }] : []
  })
  return { rows, total, labels }
}
