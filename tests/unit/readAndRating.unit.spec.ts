// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, type ComponentProps, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() }
const show = vi.fn()
const afterAction = vi.fn()
const setReadAction = vi.fn()
const setRatingAction = vi.fn()
const setReadingDatesAction = vi.fn()
const undoneListeners = new Set<() => void>()

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const { default: messages } = await import('../../messages/en.json')
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: 'en', messages, namespace: namespace as 'detail' }),
    useFormatter: () => actual.createFormatter({ locale: 'en', timeZone: 'Europe/Helsinki' }),
  }
})
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
}))
vi.mock('@/app/(frontend)/(sections)/actions', () => ({
  setReadAction,
  setRatingAction,
  setReadingDatesAction,
}))
vi.mock('@/app/(frontend)/(sections)/ShelfRows', () => ({
  useAfterAction: () => afterAction,
  useClaimUndoRefresh: () => {},
}))
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

vi.mock('@/app/(frontend)/components/ui/Picker', async () => {
  const { useEffect, useRef } = await import('react')
  return {
    // The overlay itself is Base UI's; here the Picker's form renders in place
    // while open, and `onClosed` runs once it has closed.
    PickerFrame: ({
      open,
      title,
      confirm,
      children,
      onClosed,
    }: {
      open: boolean
      title: string
      confirm: ReactNode
      children: ReactNode
      onClosed?: () => void
    }) => {
      const wasOpen = useRef(open)
      useEffect(() => {
        if (wasOpen.current && !open) onClosed?.()
        wasOpen.current = open
      }, [open, onClosed])
      return open
        ? createElement('div', { role: 'dialog', 'aria-label': title }, children, confirm)
        : null
    },
  }
})

const { ReadAndRating } = await import('@/app/(frontend)/(sections)/ReadAndRating')
const { helsinkiToday } = await import('@/fields/readingDates')

type Initial = ComponentProps<typeof ReadAndRating>['initial']
const unread: Initial = { state: 'unread', readingSince: null, finishedAt: null, rating: null }
const renderGroup = (initial: Initial = unread) =>
  render(createElement(ReadAndRating, { bookId: 7, title: 'Kätilö', initial }))
const stored = (values: Partial<Initial> & { read?: boolean }) => ({
  read: false,
  ...unread,
  tags: [],
  ...values,
})

const chosen = () =>
  screen.getByRole('group', { name: 'Reading' }).querySelector('[aria-pressed="true"]')?.textContent

describe('Read and rating in Book detail', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('starts reading with no toast and no Rating, and a select-mode (bulk) Undo still reseeds the switch', async () => {
    const today = helsinkiToday()
    const result = {
      ok: true,
      data: { state: stored({ state: 'reading', readingSince: today }), finishedDays: null },
    } as const
    setReadAction.mockResolvedValue(result)
    renderGroup()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'reading' })))

    expect(setReadAction).toHaveBeenCalledExactlyOnceWith({ bookId: 7, state: 'reading' })
    expect(show).not.toHaveBeenCalled()
    expect(afterAction).toHaveBeenCalledExactlyOnceWith(result)
    expect(chosen()).toBe('reading')
    expect(screen.getByText(/^Since/).textContent).toMatch(/· 1 day$/)
    expect(screen.queryByRole('button', { name: '4 stars' })).toBeNull()

    // A bulk Undo can still restore the values while Book detail is open.
    await act(async () => undoneListeners.forEach((listener) => listener()))

    expect(router.refresh).toHaveBeenCalledOnce()
    expect(chosen()).toBe('unread')
  })

  it('finishes a Book being read with the finish toast, no Undo, and shows the Rating', async () => {
    const data = {
      state: stored({
        read: true,
        state: 'read',
        readingSince: '2026-10-21',
        finishedAt: '2026-11-05',
      }),
      finishedDays: 15,
    }
    setReadAction.mockResolvedValue({ ok: true, data })
    renderGroup({ ...unread, state: 'reading', readingSince: '2026-10-21' })

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'read' })))

    expect(setReadAction).toHaveBeenCalledExactlyOnceWith({ bookId: 7, state: 'read' })
    expect(show).toHaveBeenCalledExactlyOnceWith({
      kind: 'success',
      message: 'Finished Kätilö · 15 days',
    })
    expect(chosen()).toBe('read')
    expect(screen.getByRole('button', { name: '4 stars' })).toBeTruthy()
  })

  it('rates with a star and clears, saving at once with no toast', async () => {
    const result = { ok: true, data: null } as const
    setRatingAction.mockResolvedValue(result)
    renderGroup({ ...unread, state: 'read' })

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
    renderGroup()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'read' })))

    expect(afterAction).toHaveBeenCalledExactlyOnceWith(failure)
    expect(show).not.toHaveBeenCalled()
    expect(chosen()).toBe('unread')
  })

  it("rejects the Picker's three cases under the field without sending", async () => {
    renderGroup({ ...unread, state: 'reading', readingSince: '2026-10-21' })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Oct/ })))
    const started = screen.getByLabelText('Started')
    const finished = screen.getByLabelText('Finished')
    const save = () =>
      act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))

    fireEvent.change(started, { target: { value: '' } })
    await save()
    expect(screen.getByText('A book being read has a start date.')).toBeTruthy()

    fireEvent.change(started, { target: { value: '2026-10-21' } })
    fireEvent.change(finished, { target: { value: '2026-10-20' } })
    await save()
    expect(screen.getByText("Can't be before the start.")).toBeTruthy()

    fireEvent.change(finished, { target: { value: '2999-01-01' } })
    await save()
    expect(screen.getByText("Can't be in the future.")).toBeTruthy()

    expect(setReadingDatesAction).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Reading dates' })).toBeTruthy()
  })
  it('saves Finished from the Picker on a Book being read as read, with the finish toast once', async () => {
    const read = stored({
      read: true,
      state: 'read',
      readingSince: '2026-10-21',
      finishedAt: '2026-11-05',
    })
    setReadingDatesAction.mockResolvedValue({ ok: true, data: read })
    renderGroup({ ...unread, state: 'reading', readingSince: '2026-10-21' })
    const save = () =>
      act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Oct/ })))
    fireEvent.change(screen.getByLabelText('Finished'), { target: { value: '2026-11-05' } })
    await save()

    expect(setReadingDatesAction).toHaveBeenCalledExactlyOnceWith({
      bookId: 7,
      readingSince: '2026-10-21',
      finishedAt: '2026-11-05',
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(chosen()).toBe('read')
    expect(screen.getByRole('button', { name: '4 stars' })).toBeTruthy()
    expect(screen.getByText(/· 15 days$/).textContent).toBe('Oct 21, 2026 – Nov 5, 2026 · 15 days')
    expect(show).toHaveBeenCalledExactlyOnceWith({
      kind: 'success',
      message: 'Finished Kätilö · 15 days',
    })

    // A further edit on the now-read Book does not toast.
    setReadingDatesAction.mockResolvedValue({
      ok: true,
      data: { ...read, finishedAt: '2026-11-04' },
    })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Nov/ })))
    fireEvent.change(screen.getByLabelText('Finished'), { target: { value: '2026-11-04' } })
    await save()

    expect(setReadingDatesAction).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(show).toHaveBeenCalledOnce()
  })

  it('shows a server field error under its field and stays open', async () => {
    setReadingDatesAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      fields: { finishedAt: 'VALIDATION' },
    })
    renderGroup({ ...unread, state: 'read', readingSince: '2026-10-21' })

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Oct/ })))
    fireEvent.change(screen.getByLabelText('Finished'), { target: { value: '2026-11-05' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))

    const finished = screen.getByLabelText('Finished')
    expect(
      document.getElementById(finished.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Check the marked fields.')
    expect(screen.getByRole('dialog', { name: 'Reading dates' })).toBeTruthy()
    expect(afterAction).not.toHaveBeenCalled()
  })
})
