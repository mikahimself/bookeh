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

  it('marks read with an Undo toast, and a toast Undo refreshes and shows unread again', async () => {
    const result = {
      ok: true,
      data: { read: true, count: 1, undoToken: 'token', undoSeconds: 1800 },
    } as const
    setReadAction.mockResolvedValue(result)
    render(createElement(ReadAndRating, { bookId: 7, initial: { read: false, rating: null } }))

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'read' })))

    expect(setReadAction).toHaveBeenCalledExactlyOnceWith({ bookId: 7, read: true })
    expect(show).toHaveBeenCalledExactlyOnceWith({
      kind: 'success',
      message: 'Marked 1 read',
      undo: { token: 'token', seconds: 1800 },
    })
    expect(afterAction).toHaveBeenCalledExactlyOnceWith(result)
    expect(chosen()).toBe('read')

    await act(async () => undoneListeners.forEach((listener) => listener()))

    expect(router.refresh).toHaveBeenCalledOnce()
    expect(chosen()).toBe('unread')
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
