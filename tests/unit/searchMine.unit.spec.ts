import { expect, it, vi } from 'vitest'

import { getEffectiveBooks } from '@/lib/books/effectiveBook'
import { getHoldings } from '@/lib/books/holdings'
import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'
import { searchMine } from '@/lib/shelf/searchMine'

vi.mock('@/lib/books/effectiveBook', () => ({ getEffectiveBooks: vi.fn() }))
vi.mock('@/lib/books/holdings', () => ({ getHoldings: vi.fn() }))
vi.mock('@/lib/payload/drizzle', () => ({ drizzleFor: vi.fn() }))

// AD-16: an unresolved effective-Book read must block holdings on the shared request.
it('waits for effective Books before starting holdings on the supplied context', async () => {
  const ctx = { user: { id: 1 }, req: {} } as Context
  let finishBooks!: (books: Awaited<ReturnType<typeof getEffectiveBooks>>) => void
  let booksStarted!: () => void
  const started = new Promise<void>((resolve) => {
    booksStarted = resolve
  })
  const pendingBooks = new Promise<Awaited<ReturnType<typeof getEffectiveBooks>>>((resolve) => {
    finishBooks = resolve
  })
  vi.mocked(drizzleFor).mockReturnValue({
    execute: vi.fn().mockResolvedValue({ rows: [{ book_id: 2 }] }),
  } as unknown as ReturnType<typeof drizzleFor>)
  vi.mocked(getEffectiveBooks).mockImplementation(() => {
    booksStarted()
    return pendingBooks
  })
  vi.mocked(getHoldings).mockResolvedValue(new Map())

  const result = searchMine(ctx, 'Kirja')
  await started
  // Let the caller continue after starting the pending read: concurrent hydration
  // would already have started holdings by this point.
  await Promise.resolve()
  expect(getEffectiveBooks).toHaveBeenCalledWith(ctx, [2])
  expect(getHoldings).not.toHaveBeenCalled()

  finishBooks(new Map())
  await expect(result).resolves.toEqual([])
  expect(getHoldings).toHaveBeenCalledExactlyOnceWith(ctx, [2])
})
