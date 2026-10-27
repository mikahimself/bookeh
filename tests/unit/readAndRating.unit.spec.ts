// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() }
const show = vi.fn()
const afterAction = vi.fn()
const setReadAction = vi.fn()
const setRatingAction = vi.fn()
const undoneListeners = new Set<() => void>()

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const { default: messages } = await import('../../messages/en.json')
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: 'en', messages, namespace: namespace as 'detail' }),
  }
})
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
}))
vi.mock('@/app/(frontend)/(sections)/actions', () => ({ setReadAction, setRatingAction }))
vi.mock('@/app/(frontend)/(sections)/ShelfRows', () => ({ useAfterAction: () => afterAction }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({
    show,
    dismiss: vi.fn(),
    withdraw: vi.fn(),
    onUndone: (listener: () => void) => {
      undoneListeners.add(listener)
      return () => undoneListeners.delete(listener)
    },
  }),
}))

const { ReadAndRating } = await import('@/app/(frontend)/(sections)/ReadAndRating')

const chosen = () =>
  screen.getByRole('group', { name: 'Read' }).querySelector('[aria-pressed="true"]')?.textContent

describe('Read and rating in Book detail', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('marks read with no toast, and a select-mode (bulk) Undo still refreshes the switch to unread', async () => {
    const result = { ok: true, data: { read: true, count: 1 } } as const
    setReadAction.mockResolvedValue(result)
    render(createElement(ReadAndRating, { bookId: 7, initial: { read: false, rating: null } }))

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'read' })))

    expect(setReadAction).toHaveBeenCalledExactlyOnceWith({ bookId: 7, read: true })
    expect(show).not.toHaveBeenCalled()
    expect(afterAction).toHaveBeenCalledExactlyOnceWith(result)
    expect(chosen()).toBe('read')

    // A bulk Undo can still restore the flag while Book detail is open.
    await act(async () => undoneListeners.forEach((listener) => listener()))

    expect(router.refresh).toHaveBeenCalledOnce()
    expect(chosen()).toBe('unread')
  })

  it('rates with a star and clears, saving at once with no toast', async () => {
    const result = { ok: true, data: null } as const
    setRatingAction.mockResolvedValue(result)
    render(createElement(ReadAndRating, { bookId: 7, initial: { read: false, rating: null } }))

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '4 stars' })))
    expect(setRatingAction).toHaveBeenCalledExactlyOnceWith({ bookId: 7, rating: 4 })
    expect(screen.getByRole('button', { name: '4 stars' }).getAttribute('aria-pressed')).toBe(
      'true',
    )

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Clear/ })))
    expect(setRatingAction.mock.calls).toEqual([
      [{ bookId: 7, rating: 4 }],
      [{ bookId: 7, rating: null }],
    ])
    expect(screen.queryByRole('button', { name: /^Clear/ })).toBeNull()
    expect(show).not.toHaveBeenCalled()
    expect(afterAction.mock.calls).toEqual([[result], [result]])
  })

  it('reports a failed save once, through afterAction, and falls back to the stored value', async () => {
    const failure = { ok: false, code: 'NOT_FOUND' } as const
    setReadAction.mockResolvedValue(failure)
    render(createElement(ReadAndRating, { bookId: 7, initial: { read: false, rating: null } }))

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'read' })))

    expect(afterAction).toHaveBeenCalledExactlyOnceWith(failure)
    expect(show).not.toHaveBeenCalled()
    expect(chosen()).toBe('unread')
  })
})
