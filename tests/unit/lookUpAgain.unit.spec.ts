// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import type { LookUpAgainOutcome } from '@/app/(frontend)/actions/catalogue'
import type { ActionResult } from '@/lib/errors'

// Look it up again (D-8, story 5.35): the Link over a mocked
// `lookUpAgainAction`. An `editions` answer opens the edition Picker and a
// row calls again with that candidate; every other answer is a toast without
// Undo and goes to `onSettled`, as does a failure.

const show = vi.fn()
const onSettled = vi.fn()
const lookUpAgainAction = vi.fn<(input: unknown) => Promise<ActionResult<LookUpAgainOutcome>>>()

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const { default: messages } = await import('../../messages/en.json')
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: 'en', messages, namespace: namespace as 'detail' }),
    useFormatter: () => actual.createFormatter({ locale: 'en' }),
  }
})
// The Picker's close may replace the address (`useCloseOnBack`); nothing here moves it.
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/app/(frontend)/actions/catalogue', () => ({ lookUpAgainAction }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss: vi.fn(), withdraw: vi.fn(), onUndone: () => () => {} }),
}))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { LookUpAgainLink } = await import('@/app/(frontend)/(sections)/LookUpAgain')

installNavigationTracking()

const ids = [
  { source: 'finna', recordId: 'finna.1' },
  { source: 'google', recordId: 'g.2' },
]
const editions: LookUpAgainOutcome = {
  kind: 'editions',
  pick: 0,
  rows: [
    { cover: null, title: 'Kätilö', line: 'WSOY · 2011' },
    { cover: null, title: 'Kätilö', line: 'Otava · 2012 · 348 pages' },
  ],
  ids,
}

const link = () => screen.getByRole('button', { name: 'Look it up again' })
const popState = () => act(() => window.dispatchEvent(new PopStateEvent('popstate')))

describe('LookUpAgainLink', () => {
  let back: MockInstance<History['back']>

  beforeEach(() => {
    window.history.pushState({ page: 'detail' }, '', '/?book=5')
    // The Sheet: the phone form.
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        media: query,
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    )
    back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    render(createElement(LookUpAgainLink, { bookId: 5, onSettled }))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens the edition Picker on editions and calls again with the picked candidate', async () => {
    lookUpAgainAction.mockResolvedValueOnce({ ok: true, data: editions })
    fireEvent.click(link())

    await screen.findByRole('dialog', { name: 'Editions' })
    expect(lookUpAgainAction).toHaveBeenCalledExactlyOnceWith({ bookId: 5 })
    expect(show).not.toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()

    const shared = { kind: 'shared', bookId: 5, source: 'google' } as const
    lookUpAgainAction.mockResolvedValueOnce({ ok: true, data: shared })
    fireEvent.click(screen.getByRole('button', { name: 'Otava · 2012 · 348 pages' }))
    await waitFor(() => expect(back).toHaveBeenCalledOnce())
    popState()

    await waitFor(() =>
      expect(lookUpAgainAction).toHaveBeenLastCalledWith({ bookId: 5, candidate: ids[1] }),
    )
    await waitFor(() =>
      expect(show).toHaveBeenCalledExactlyOnceWith({
        kind: 'success',
        message: 'Shared · from Google Books',
      }),
    )
    expect(onSettled).toHaveBeenCalledExactlyOnceWith({ ok: true, data: shared })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it.each<[Exclude<LookUpAgainOutcome, { kind: 'editions' }>, string]>([
    [{ kind: 'shared', bookId: 5, source: 'finna' }, 'Shared · from Finna'],
    [{ kind: 'shared', bookId: 9, source: null }, 'Shared'],
    [{ kind: 'none' }, 'Still not found.'],
    [{ kind: 'unavailable', failed: ['finna', 'google'] }, "Finna and Google Books didn't answer."],
  ])('toasts %j without Undo and settles with it', async (data, message) => {
    lookUpAgainAction.mockResolvedValueOnce({ ok: true, data })
    fireEvent.click(link())

    await waitFor(() => expect(show).toHaveBeenCalledExactlyOnceWith({ kind: 'success', message }))
    expect(onSettled).toHaveBeenCalledExactlyOnceWith({ ok: true, data })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('settles a failure without a toast', async () => {
    const failure = { ok: false, code: 'NOT_FOUND' } as const
    lookUpAgainAction.mockResolvedValueOnce(failure)
    fireEvent.click(link())

    await waitFor(() => expect(onSettled).toHaveBeenCalledExactlyOnceWith(failure))
    expect(show).not.toHaveBeenCalled()
  })
})
