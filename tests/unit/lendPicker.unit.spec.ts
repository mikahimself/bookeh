// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Epic 6 retro decision 4: the Lend picker reads today in Helsinki at each
// open, so Book detail left open past midnight offers the new day.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/app/(frontend)/actions/loans', () => ({ lendCopyAction: vi.fn() }))
vi.mock('@/app/(frontend)/(sections)/ShelfRows', () => ({ useAfterAction: () => vi.fn() }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { LendPicker } = await import('@/app/(frontend)/(sections)/LendPicker')

installNavigationTracking()

const picker = (open: boolean) =>
  createElement(LendPicker, {
    open,
    onOpenChange: () => {},
    context: 'Sinuhe',
    people: [],
    copyId: 1,
    startTransition: (callback) => void callback(),
    pending: false,
  })

const dateField = () => screen.getByLabelText<HTMLInputElement>('loans.lentOnLabel')

describe('LendPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        media: query,
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('offers today in Helsinki at each open, the new day after midnight', () => {
    // 23:50 in Helsinki (UTC+2 in late October after the change).
    vi.setSystemTime(new Date('2026-10-30T21:50:00Z'))
    const { rerender } = render(picker(true))
    expect(dateField().value).toBe('2026-10-30')
    expect(dateField().max).toBe('2026-10-30')

    rerender(picker(false))
    vi.setSystemTime(new Date('2026-10-30T22:10:00Z'))
    rerender(picker(true))

    expect(dateField().value).toBe('2026-10-31')
    expect(dateField().max).toBe('2026-10-31')
  })
})
