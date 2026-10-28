// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh, replace: vi.fn() }),
}))
vi.mock('@/app/(frontend)/components/navigation', () => ({ useTaskBack: () => vi.fn() }))
vi.mock('@/app/(frontend)/scan/actions', () => ({
  saveManualAction: vi.fn(),
  saveEntryAction: vi.fn(),
}))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}))

const { UnavailableActions } = await import('@/app/(frontend)/scan/UnavailableActions')

describe('UnavailableActions', () => {
  beforeEach(() => {
    // The picker under Add to wishlist reads the wide query.
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        media: query,
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    )
    render(createElement(UnavailableActions, { isbn13: '9789510397077', lists: [] }))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('re-renders the same address on Try again', () => {
    fireEvent.click(screen.getByRole('button', { name: 'answer.tryAgain' }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('unfolds the Not found form in place of Try again on Add by hand', () => {
    fireEvent.click(screen.getByRole('button', { name: 'answer.addByHand' }))
    expect(document.activeElement).toBe(screen.getByLabelText('answer.title'))
    screen.getByLabelText('answer.author')
    screen.getByRole('button', { name: 'answer.addToLibrary' })
    expect(screen.queryByRole('button', { name: 'answer.tryAgain' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'answer.addByHand' })).toBeNull()
  })
})
