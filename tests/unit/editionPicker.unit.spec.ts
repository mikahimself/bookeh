// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

const replace = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { n: number }) =>
    values ? `${key}:${values.n}` : key,
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace }),
}))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { EditionPicker } = await import('@/app/(frontend)/scan/EditionPicker')

installNavigationTracking()

const ISBN = '9780007466061'

describe('EditionPicker', () => {
  let back: MockInstance<History['back']>

  beforeEach(() => {
    window.history.pushState({ page: 'answer' }, '', `/scan?isbn=${ISBN}`)
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
    render(
      createElement(EditionPicker, {
        isbn13: ISBN,
        pick: 0,
        editions: [
          {
            cover: `/data/cover/${ISBN}?pick=0`,
            title: 'A Game of Thrones',
            line: 'nidottu · 2012',
          },
          { cover: null, title: 'A Game of Thrones', line: '2012 · 690 pages' },
        ],
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'answer.editionsFound:2' }))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    replace.mockReset()
  })

  /** The picker's history entry going away, as Back's popstate reports it. */
  const popState = () => act(() => window.dispatchEvent(new PopStateEvent('popstate')))

  it('replaces the Answer with the picked edition once the picker is gone', async () => {
    fireEvent.click(screen.getByRole('button', { name: '2012 · 690 pages' }))
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
    popState()
    await waitFor(() =>
      expect(replace).toHaveBeenCalledExactlyOnceWith(`/scan?isbn=${ISBN}&pick=1`),
    )
  })

  it('does not navigate for the edition already shown', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'nidottu · 2012' }))
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
    popState()
    expect(replace).not.toHaveBeenCalled()
  })
})
