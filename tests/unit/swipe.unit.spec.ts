import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))

const { SWIPE_EDGE_PX, SWIPE_MIN_PX, suspendSwipe, swipeDirection, swipeSuspended, swipeTarget } =
  await import('@/app/(frontend)/components/swipe')

const PHONE = 390
const y = 400

describe('swipeDirection', () => {
  it('names the thresholds', () => {
    expect([SWIPE_EDGE_PX, SWIPE_MIN_PX]).toEqual([24, 48])
  })

  it.each([
    ['left is next', { x: 300, y }, { x: 100, y: y + 10 }, PHONE, 'next'],
    ['right is prev', { x: 100, y }, { x: 300, y }, PHONE, 'prev'],
    ['from the left edge', { x: 23, y }, { x: 300, y }, PHONE, null],
    ['from the right edge', { x: PHONE - 23, y }, { x: 100, y }, PHONE, null],
    ['just inside the left edge', { x: 24, y }, { x: 300, y }, PHONE, 'prev'],
    ['just inside the left edge, leftwards', { x: 24, y }, { x: -30, y }, PHONE, 'next'],
    ['just inside the right edge', { x: PHONE - 24, y }, { x: 100, y }, PHONE, 'next'],
    ['ending in the left edge', { x: 72, y }, { x: 10, y }, PHONE, 'next'],
    ['too short', { x: 200, y }, { x: 153, y }, PHONE, null],
    ['just long enough', { x: 200, y }, { x: 152, y }, PHONE, 'next'],
    ['too steep', { x: 300, y }, { x: 200, y: y + 51 }, PHONE, null],
    ['just shallow enough', { x: 300, y }, { x: 200, y: y - 50 }, PHONE, 'next'],
    ['downwards', { x: 200, y }, { x: 190, y: y + 300 }, PHONE, null],
    ['on a wide viewport', { x: 600, y }, { x: 300, y }, 900, null],
    ['just under wide', { x: 600, y }, { x: 300, y }, 899, 'next'],
  ])('%s', (_, start, end, width, expected) => {
    expect(swipeDirection(start, end, width)).toBe(expected)
  })
})

describe('swipe suspension', () => {
  it('counts holds: two holders need two releases', () => {
    expect(swipeSuspended()).toBe(false)
    const first = suspendSwipe()
    const second = suspendSwipe()
    expect(swipeSuspended()).toBe(true)
    first()
    expect(swipeSuspended()).toBe(true)
    second()
    expect(swipeSuspended()).toBe(false)
  })

  it('releases idempotently', () => {
    const first = suspendSwipe()
    const second = suspendSwipe()
    first()
    first()
    expect(swipeSuspended()).toBe(true)
    second()
    expect(swipeSuspended()).toBe(false)
  })
})

describe('swipeTarget', () => {
  const leftwards = [
    { x: 300, y },
    { x: 100, y: y + 10 },
  ] as const
  const rightwards = [
    { x: 100, y },
    { x: 300, y },
  ] as const

  it.each([
    ['/loans', leftwards, { href: '/wishlists', type: 'section-next' }],
    ['/loans', rightwards, { href: '/', type: 'section-prev' }],
    ['/settings', leftwards, { href: '/', type: 'section-next' }],
    ['/', rightwards, { href: '/settings', type: 'section-prev' }],
    [
      '/loans',
      [
        { x: 23, y },
        { x: 300, y },
      ] as const,
      null,
    ],
  ])('on %s goes to %o', (pathname, [start, end], expected) => {
    expect(swipeTarget(start, end, PHONE, pathname)).toEqual(expected)
  })

  it('goes nowhere while a suspension is held, and resumes on its release', () => {
    const release = suspendSwipe()
    expect(swipeTarget(...leftwards, PHONE, '/loans')).toBeNull()
    release()
    expect(swipeTarget(...leftwards, PHONE, '/loans')).toEqual({
      href: '/wishlists',
      type: 'section-next',
    })
  })
})
