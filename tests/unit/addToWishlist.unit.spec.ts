// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Add to wishlist (EXPERIENCE.md, Answer → Add to wishlist): the picker, the
// `Ref` it sends, and the press semantics shared with Add to library.

const back = vi.fn()
const refresh = vi.fn()
const show = vi.fn()
const saveEntryAction = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { list: string }) =>
    values ? `${key}:${values.list}` : key,
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn(), refresh }),
}))
vi.mock('@/app/(frontend)/components/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(frontend)/components/navigation')>()),
  useTaskBack: () => back,
}))
vi.mock('@/app/(frontend)/scan/actions', () => ({ saveEntryAction }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss: vi.fn() }),
}))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { AddToWishlist } = await import('@/app/(frontend)/scan/AddToWishlist')

installNavigationTracking()

const ISBN = '9789510397077'
const LISTS = [
  { id: 4, name: 'Joululahjat', count: 2 },
  { id: 7, name: 'Omat', count: 0 },
]

const saved = (name: string) => ({
  ok: true,
  data: { bookId: 9, entryId: 12, savedTo: { id: 4, name }, undoToken: 'token', undoSeconds: 1800 },
})

const press = () =>
  fireEvent.click(
    screen.getByRole<HTMLButtonElement>('button', { name: 'wishlists.addToWishlist' }),
  )
const picker = () => screen.queryByRole('dialog', { name: 'wishlists.addToWishlist' })
const sent = () => saveEntryAction.mock.calls.map(([input]) => input as Record<string, unknown>)

describe('AddToWishlist', () => {
  beforeEach(() => {
    window.history.pushState({ page: 'answer' }, '', `/scan?isbn=${ISBN}`)
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        media: query,
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
    vi.unstubAllGlobals()
  })

  it('with no lists offers only New list, focused, and saves the typed name', async () => {
    saveEntryAction.mockResolvedValue(saved('Joululahjat'))
    render(createElement(AddToWishlist, { lists: [], title: 'Sinuhe', target: { isbn13: ISBN } }))
    press()

    const field = await screen.findByLabelText<HTMLInputElement>('wishlists.newList')
    await waitFor(() => expect(document.activeElement).toBe(field))
    expect(screen.getByText('Sinuhe')).toBeTruthy()
    fireEvent.change(field, { target: { value: 'Joululahjat' } })
    fireEvent.click(screen.getByRole('button', { name: 'wishlists.add' }))

    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
    expect(sent()).toEqual([
      {
        requestId: expect.any(String),
        wishlist: { create: 'Joululahjat' },
        target: { isbn13: ISBN },
      },
    ])
    expect(show).toHaveBeenCalledWith({
      kind: 'success',
      message: 'toast.addedTo:Joululahjat',
      hold: true,
      undo: { token: 'token', seconds: 1800 },
    })
  })

  it('saves straight to the one list, with no picker', async () => {
    saveEntryAction.mockResolvedValue(saved('Joululahjat'))
    render(
      createElement(AddToWishlist, {
        lists: [LISTS[0]!],
        title: 'Sinuhe',
        target: { isbn13: ISBN },
      }),
    )
    press()

    expect(picker()).toBeNull()
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
    expect(sent()).toEqual([
      { requestId: expect.any(String), wishlist: 4, target: { isbn13: ISBN } },
    ])
  })

  it('saves to the row chosen among several', async () => {
    saveEntryAction.mockResolvedValue(saved('Omat'))
    render(
      createElement(AddToWishlist, { lists: LISTS, title: 'Sinuhe', target: { isbn13: ISBN } }),
    )
    press()

    fireEvent.click(await screen.findByRole('button', { name: /Omat/ }))
    await waitFor(() => expect(saveEntryAction).toHaveBeenCalledTimes(1))
    expect(sent()[0]).toMatchObject({ wishlist: 7, target: { isbn13: ISBN } })
  })

  it('stays in Book detail, without hold, and saves again with a new requestId', async () => {
    saveEntryAction.mockResolvedValue(saved('Joululahjat'))
    render(
      createElement(AddToWishlist, {
        lists: [LISTS[0]!],
        title: 'Sinuhe',
        target: { bookId: 9 },
        stay: true,
      }),
    )
    press()
    await waitFor(() => expect(show).toHaveBeenCalledTimes(1))
    expect(show).toHaveBeenCalledWith({
      kind: 'success',
      message: 'toast.addedTo:Joululahjat',
      undo: { token: 'token', seconds: 1800 },
    })

    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'wishlists.addToWishlist' }).disabled,
      ).toBe(false),
    )
    press()
    await waitFor(() => expect(saveEntryAction).toHaveBeenCalledTimes(2))
    const [first, second] = sent()
    expect(first).toMatchObject({ target: { bookId: 9 } })
    expect(second!.requestId).not.toBe(first!.requestId)
    expect(back).not.toHaveBeenCalled()
  })

  it('re-renders the address on NOT_FOUND, with no toast and no return', async () => {
    saveEntryAction.mockResolvedValue({ ok: false, code: 'NOT_FOUND' })
    render(
      createElement(AddToWishlist, {
        lists: [LISTS[0]!],
        title: 'Sinuhe',
        target: { isbn13: ISBN },
      }),
    )
    press()

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(show).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('reports any other failure, stays, and retries with the same requestId', async () => {
    saveEntryAction.mockResolvedValueOnce({ ok: false, code: 'SAVE_FAILED' })
    render(
      createElement(AddToWishlist, {
        lists: [LISTS[0]!],
        title: 'Sinuhe',
        target: { isbn13: ISBN },
      }),
    )
    press()

    await waitFor(() => expect(show).toHaveBeenCalledWith({ kind: 'error', code: 'SAVE_FAILED' }))
    expect(back).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'wishlists.addToWishlist' }).disabled,
      ).toBe(false),
    )

    saveEntryAction.mockResolvedValue(saved('Joululahjat'))
    press()
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
    const [first, retry] = sent()
    expect(retry!.requestId).toBe(first!.requestId)
  })
})
