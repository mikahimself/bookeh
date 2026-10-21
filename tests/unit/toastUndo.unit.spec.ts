// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ToastInput } from '@/app/(frontend)/components/toast/store'

const replace = vi.fn()
const undoAction = vi.fn()

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace }),
  usePathname: () => '/scan',
}))
vi.mock('@/app/(frontend)/actions/undo', () => ({ undoAction }))

const { ToastProvider, useToast } = await import('@/app/(frontend)/components/toast/ToastProvider')

/** Raises `input` through the context once mounted, as a page would. */
function Raise({ input }: { input: ToastInput }) {
  const { show } = useToast()
  useEffect(() => {
    show(input)
  }, [show, input])
  return null
}

const saved: ToastInput = {
  kind: 'success',
  message: 'Saved',
  hold: true,
  undo: { token: 'tok', seconds: 1800 },
}

const mount = (input: ToastInput) =>
  render(createElement(ToastProvider, null, createElement(Raise, { input })))

const undoLink = () => screen.queryByRole<HTMLButtonElement>('button', { name: 'toast.undo' })

describe('Undo on the toast', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('calls undoAction with the token once and becomes "Undone" without an Undo Link', async () => {
    undoAction.mockResolvedValue({ ok: true, data: null })
    mount(saved)
    fireEvent.click(undoLink()!)
    await waitFor(() => expect(screen.getByText('toast.undone')).toBeTruthy())
    expect(undoAction).toHaveBeenCalledTimes(1)
    expect(undoAction).toHaveBeenCalledWith('tok')
    expect(undoLink()).toBeNull()
    expect(screen.queryByText('Saved')).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it.each([
    ['a failed undo', () => Promise.resolve({ ok: false, code: 'UNDO_FAILED' }), 'UNDO_FAILED'],
    [
      'a dropped connection',
      () => Promise.reject(new TypeError('Failed to fetch')),
      'NO_CONNECTION',
    ],
  ])('shows an error toast for %s', async (_, call, code) => {
    undoAction.mockImplementation(call)
    mount(saved)
    fireEvent.click(undoLink()!)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(`errors.${code}`))
    expect(undoLink()).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it('goes to sign in and back here, query included, when the session is gone', async () => {
    history.replaceState(null, '', '/scan?isbn=9789510000000')
    undoAction.mockResolvedValue({ ok: false, code: 'UNAUTHENTICATED' })
    mount(saved)
    fireEvent.click(undoLink()!)
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/login?next=%2Fscan%3Fisbn%3D9789510000000'),
    )
    expect(screen.queryByRole('alert')).toBeNull()
    // Dismissed: the provider wraps /login too, so the Link must not follow us there.
    expect(undoLink()).toBeNull()
  })

  it('hides the Undo Link when its seconds run out, keeping the toast and its X', () => {
    vi.useFakeTimers()
    mount({ ...saved, undo: { token: 'tok', seconds: 5 } })
    expect(undoLink()).toBeTruthy()
    act(() => vi.advanceTimersByTime(5000))
    expect(undoLink()).toBeNull()
    expect(screen.getByText('Saved')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'toast.close' })).toBeTruthy()
  })

  it('disables the Link while the action is pending, so a second tap does nothing', async () => {
    let settle: (value: unknown) => void = () => {}
    undoAction.mockImplementation(() => new Promise((resolve) => (settle = resolve)))
    mount(saved)
    fireEvent.click(undoLink()!)
    await waitFor(() => expect(undoLink()!.disabled).toBe(true))
    fireEvent.click(undoLink()!)
    expect(undoAction).toHaveBeenCalledTimes(1)
    await act(async () => settle({ ok: true, data: null }))
    await waitFor(() => expect(screen.getByText('toast.undone')).toBeTruthy())
  })

  it('links Edit before Undo, and tapping it dismisses the toast', async () => {
    mount({ ...saved, message: 'Saved to Tampere', edit: '/books/7/edit?copy=9' })
    const edit = screen.getByRole('link', { name: 'toast.edit' })
    expect(edit.getAttribute('href')).toBe('/books/7/edit?copy=9')
    expect(
      edit.compareDocumentPosition(undoLink()!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    fireEvent.click(edit)
    await waitFor(() => expect(screen.queryByText('Saved to Tampere')).toBeNull())
  })

  it('offers Reload on an APP_UPDATED error, which reloads the page', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    mount({ kind: 'error', code: 'APP_UPDATED' })
    fireEvent.click(screen.getByRole('button', { name: 'toast.reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it.each<[string, ToastInput]>([
    ['a success without undo', { kind: 'success', message: 'Saved', hold: true }],
    ['an error', { kind: 'error', code: 'INTERNAL' }],
  ])('renders no Undo Link on %s', (_, input) => {
    mount(input)
    expect(screen.getByRole('button', { name: 'toast.close' })).toBeTruthy()
    expect(undoLink()).toBeNull()
    expect(screen.queryByRole('button', { name: 'toast.reload' })).toBeNull()
  })
})
