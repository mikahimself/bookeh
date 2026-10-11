// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const replace = vi.fn()
const show = vi.fn()
const signOutAction = vi.fn()

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/app/(frontend)/actions/account', () => ({ signOutAction }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss: vi.fn() }),
}))

const { SignOutButton } = await import('@/app/(frontend)/components/SignOutButton')

const press = () => {
  render(createElement(SignOutButton))
  fireEvent.click(screen.getByRole('button', { name: 'signOut.submit' }))
}

describe('SignOutButton', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it.each([
    ['a failed action', () => Promise.resolve({ ok: false, code: 'INTERNAL' })],
    ['a rejected call', () => Promise.reject(new Error('offline'))],
  ])(
    'shows an error toast for %s, not an inline message, and stays on the page',
    async (_, call) => {
      signOutAction.mockImplementation(call)
      press()
      await waitFor(() => expect(show).toHaveBeenCalledWith({ kind: 'error', code: 'INTERNAL' }))
      expect(replace).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).toBeNull()
      await waitFor(() =>
        expect(screen.getByRole<HTMLButtonElement>('button').disabled).toBe(false),
      )
    },
  )

  it.each([
    ['success', { ok: true, data: null }],
    ['a session already gone', { ok: false, code: 'UNAUTHENTICATED' }],
  ])('goes to /login on %s without a toast', async (_, result) => {
    signOutAction.mockResolvedValue(result)
    press()
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
    expect(show).not.toHaveBeenCalled()
  })
})
