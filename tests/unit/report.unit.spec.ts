// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const replace = vi.fn()
const show = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss: vi.fn() }),
}))

const { useReportFailure } = await import('@/app/(frontend)/(sections)/settings/report')

describe('useReportFailure', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('sends a signed-out session back to sign in, returning to Settings', () => {
    const { result } = renderHook(() => useReportFailure())
    result.current('UNAUTHENTICATED')
    expect(replace).toHaveBeenCalledWith('/login?next=%2Fsettings')
    expect(show).not.toHaveBeenCalled()
  })

  it('toasts any other failure and stays on the page', () => {
    const { result } = renderHook(() => useReportFailure())
    result.current('INTERNAL')
    expect(show).toHaveBeenCalledWith({ kind: 'error', code: 'INTERNAL' })
    expect(replace).not.toHaveBeenCalled()
  })
})
