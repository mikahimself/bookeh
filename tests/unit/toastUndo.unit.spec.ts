// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ToastInput } from '@/app/(frontend)/components/toast/store'

const replace = vi.fn()
const undoAction = vi.fn()

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
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
    ['a rejected call', () => Promise.reject(new Error('offline')), 'INTERNAL'],
  ])('shows an error toast for %s', async (_, call, code) => {
    undoAction.mockImplementation(call)
    mount(saved)
    fireEvent.click(undoLink()!)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(`errors.${code}`))
    expect(undoLink()).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it('goes to sign in and back here when the session is gone', async () => {
    undoAction.mockResolvedValue({ ok: false, code: 'UNAUTHENTICATED' })
    mount(saved)
    fireEvent.click(undoLink()!)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?next=%2Fscan'))
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

  it.each<[string, ToastInput]>([
    ['a success without undo', { kind: 'success', message: 'Saved', hold: true }],
    ['an error', { kind: 'error', code: 'INTERNAL' }],
  ])('renders no Undo Link on %s', (_, input) => {
    mount(input)
    expect(screen.getByRole('button', { name: 'toast.close' })).toBeTruthy()
    expect(undoLink()).toBeNull()
  })
})
