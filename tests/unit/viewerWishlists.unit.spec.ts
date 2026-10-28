import { describe, expect, it, vi } from 'vitest'

// Add to wishlist's lists: a failed read leaves the picker with New list alone.

const listWishlists = vi.fn()
const error = vi.fn()

vi.mock('@/lib/wishlists/wishlists', () => ({ listWishlists }))
vi.mock('@/lib/errors', () => ({ logger: () => ({ error }) }))

const { viewerWishlists } = await import('@/app/(frontend)/scan/viewerWishlists')

describe('viewerWishlists', () => {
  it('logs a failed read and reads as no lists', async () => {
    listWishlists.mockRejectedValue(new Error('down'))

    expect(await viewerWishlists({} as never)).toEqual([])
    expect(error).toHaveBeenCalledTimes(1)
  })
})
