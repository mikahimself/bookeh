// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WishlistLine } from '@/lib/wishlists/wishlists'

// EXPERIENCE.md, Wishlists and States; FR-38, FR-39: one List row per list
// (name as typed, its count, a link to the list); "No wishlists" and New
// list; Load failed; New list's dialog keeps a taken name open under the
// field and closes on success.

const refresh = vi.fn()
const listWishlists = vi.fn<(ctx: unknown) => Promise<WishlistLine[]>>()
const createWishlistAction = vi.fn()
const logError = vi.fn()

const english = async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const { default: messages } = await import('../../messages/en.json')
  return (namespace?: string) =>
    createTranslator({ locale: 'en', messages, namespace: namespace as 'wishlists' })
}

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: await english(),
}))
vi.mock('next-intl/server', async () => {
  const translator = await english()
  return { getTranslations: async (namespace?: string) => translator(namespace) }
})
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn(), refresh }),
}))
vi.mock('@/lib/payload/context', () => ({ requireUser: async () => ({ user: { id: 1 } }) }))
vi.mock('@/lib/errors', () => ({ logger: () => ({ error: logError }) }))
vi.mock('@/lib/wishlists/wishlists', () => ({ listWishlists }))
vi.mock('@/app/(frontend)/actions/wishlists', () => ({ createWishlistAction }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn(), withdraw: vi.fn() }),
}))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { default: WishlistsPage } = await import('@/app/(frontend)/(sections)/wishlists/page')

installNavigationTracking()

const renderPage = async () => render((await WishlistsPage()) as ReactElement)

describe('Wishlists section', () => {
  beforeEach(() => {
    window.history.pushState({ page: 'wishlists' }, '', '/wishlists')
    vi.stubGlobal('matchMedia', (query: string) => ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows each list as a row linking to it, with its name as typed and its count', async () => {
    listWishlists.mockResolvedValue([
      { id: 7, name: 'Christmas', count: 0 },
      { id: 3, name: 'Me', count: 2 },
    ])
    await renderPage()

    const rows = screen.getAllByRole('link')
    expect(rows.map((row) => [row.getAttribute('href'), row.textContent])).toEqual([
      ['/wishlists/7', 'Christmas0 books'],
      ['/wishlists/3', 'Me2 books'],
    ])
    expect(screen.getByRole('button', { name: 'New list' })).toBeTruthy()
  })

  it('shows No wishlists and New list when there are none', async () => {
    listWishlists.mockResolvedValue([])
    await renderPage()

    expect(screen.getByText('No wishlists')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New list' })).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows Load failed and logs when the read fails', async () => {
    const err = new Error('db down')
    listWishlists.mockRejectedValue(err)
    await renderPage()

    expect(screen.getByText("Couldn't load.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New list' })).toBeNull()
    expect(logError).toHaveBeenCalledWith({ err }, expect.any(String))
  })

  it('New list keeps the dialog open with the message under the field for a taken name', async () => {
    listWishlists.mockResolvedValue([{ id: 3, name: 'Me', count: 0 }])
    createWishlistAction.mockResolvedValue({ ok: false, code: 'NAME_TAKEN', conflictId: 3 })
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'New list' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'me' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(await within(dialog).findByText('That name is already in use.')).toBeTruthy()
    expect(createWishlistAction).toHaveBeenCalledExactlyOnceWith('me')
    expect(within(dialog).getByLabelText('Name').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('New list closes the dialog and refreshes on success', async () => {
    listWishlists.mockResolvedValue([])
    createWishlistAction.mockResolvedValue({ ok: true, data: null })
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'New list' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Christmas' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(createWishlistAction).toHaveBeenCalledExactlyOnceWith('Christmas')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
