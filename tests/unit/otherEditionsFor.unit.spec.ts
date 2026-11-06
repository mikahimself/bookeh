import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HeldAnswer, ScanOutcome, SourceAnswer } from '@/app/(frontend)/scan/answer'

// The other-edition notice's gate (FR-20): which Answers read it, with which
// Book excluded, and a failed read as no notice.

const otherEditions = vi.fn()
const error = vi.fn()

vi.mock('@/lib/shelf/otherEditions', () => ({ otherEditions }))
vi.mock('@/lib/errors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/errors')>()),
  logger: () => ({ error }),
}))

const { otherEditionsFor } = await import('@/app/(frontend)/scan/otherEditionsFor')

const ctx = {} as never
const book = { title: 'Elolliset', authors: ['Kytömäki'] }
const held = (heading: HeldAnswer['heading']): ScanOutcome => ({
  kind: 'held',
  answer: { ...book, bookId: 7, heading } as HeldAnswer,
})
const notInLibrary: ScanOutcome = { kind: 'notInLibrary', answer: book as SourceAnswer }

describe('otherEditionsFor', () => {
  beforeEach(() => {
    otherEditions.mockReset().mockResolvedValue([])
    error.mockReset()
  })

  it('reads for On wishlist and Ordered without their own Book, and for Not in library', async () => {
    await otherEditionsFor(ctx, held('onWishlist'))
    await otherEditionsFor(ctx, held('ordered'))
    await otherEditionsFor(ctx, notInLibrary)

    expect(otherEditions.mock.calls.map(([, query]) => query)).toEqual([
      { bookId: 7, ...book },
      { bookId: 7, ...book },
      { bookId: null, ...book },
    ])
  })

  it('reads nothing for In library, Not found and Couldn’t look it up', async () => {
    for (const outcome of [
      held('inLibrary'),
      { kind: 'notFound', isbn13: null, title: '' },
      { kind: 'unavailable', isbn13: '9789510000000', failed: [] },
    ] satisfies ScanOutcome[]) {
      expect(await otherEditionsFor(ctx, outcome)).toEqual([])
    }
    expect(otherEditions).not.toHaveBeenCalled()
  })

  it('logs a failed read and shows no notice', async () => {
    otherEditions.mockRejectedValue(new Error('down'))

    expect(await otherEditionsFor(ctx, notInLibrary)).toEqual([])
    expect(error).toHaveBeenCalledTimes(1)
  })
})
