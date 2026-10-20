// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ToastInput } from '@/app/(frontend)/components/toast/store'

const show = vi.fn()

vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show }),
}))

const { RaiseToast } = await import('@/app/(frontend)/components/toast/RaiseToast')

const input: ToastInput = { kind: 'error', code: 'RATE_LIMITED' }

describe('RaiseToast', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // The /scan page keys it per render: a resubmit over the limit must toast again.
  it('shows once per mount, and again under a new key', () => {
    const view = render(createElement(RaiseToast, { key: 'a', input }))
    view.rerender(createElement(RaiseToast, { key: 'a', input }))
    expect(show).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledWith(input)

    view.rerender(createElement(RaiseToast, { key: 'b', input }))
    expect(show).toHaveBeenCalledTimes(2)
  })
})
