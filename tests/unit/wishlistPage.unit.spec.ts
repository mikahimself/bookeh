// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { WishlistView } from '@/lib/wishlists/wishlists'

// EXPERIENCE.md, Wishlists and States; FR-38, FR-39, FR-48: one list under a
// Back link, its name as typed as the `h1`; a row per open entry with "For
// {person}" only when it has a recipient; "Nothing on this list."; Load
// failed; a foreign or bad id redirects; Delete confirms, deletes and leaves.

const router = { replace: vi.fn(), refresh: vi.fn() }
const getWishlist = vi.fn<(ctx: unknown, id: number) => Promise<WishlistView | null>>()
const getEffectiveBooks =
  vi.fn<(ctx: unknown, ids: readonly number[]) => Promise<Map<number, EffectiveBook>>>()
const deleteWishlistAction = vi.fn()
const logError = vi.fn()
const redirect = vi.fn((href: string) => {
  throw new Error(`redirect ${href}`)
})

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
  useRouter: () => router,
  redirect,
}))
vi.mock('@/lib/payload/context', () => ({ requireUser: async () => ({ user: { id: 1 } }) }))
vi.mock('@/lib/errors', () => ({ logger: () => ({ error: logError }) }))
vi.mock('@/lib/wishlists/wishlists', () => ({ getWishlist }))
vi.mock('@/lib/books/effectiveBook', () => ({ getEffectiveBooks }))
vi.mock('@/app/(frontend)/actions/wishlists', () => ({
  renameWishlistAction: vi.fn(),
  deleteWishlistAction,
}))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn(), withdraw: vi.fn() }),
}))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { default: WishlistPage } =
  await import('@/app/(frontend)/(sections)/wishlists/[listId]/page')

installNavigationTracking()

const renderPage = async (listId = '7') =>
  render((await WishlistPage({ params: Promise.resolve({ listId }) })) as ReactElement)

const book = (bookId: number, title: string, authors: EffectiveBook['authors']): EffectiveBook => ({
  bookId,
  isbn13: null,
  visibility: 'shared',
  source: null,
  title,
  subtitle: null,
  authors,
  series: null,
  seriesIndex: null,
  genres: [],
  themes: [],
  publisher: null,
  year: null,
  language: null,
  pages: null,
  description: null,
  coverUrl: null,
  overridden: [],
})

const christmas: WishlistView = {
  id: 7,
  name: 'Christmas list',
  entries: [
    { entryId: 2, bookId: 10, forPerson: null },
    { entryId: 1, bookId: 11, forPerson: { id: 5, name: 'Äiti' } },
  ],
}

describe('One wishlist', () => {
  beforeEach(() => {
    window.history.pushState({ page: 'list' }, '', '/wishlists/7')
    vi.stubGlobal('matchMedia', (query: string) => ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    getEffectiveBooks.mockResolvedValue(
      new Map([
        [10, book(10, 'Puhdistus', [{ id: 3, name: 'Sofi Oksanen' }])],
        [11, book(11, 'Sinuhe', [])],
      ]),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows the Back link, the name as typed as the h1, the count and a row per entry', async () => {
    getWishlist.mockResolvedValue(christmas)
    await renderPage()

    expect(screen.getByRole('link', { name: 'Wishlists' }).getAttribute('href')).toBe('/wishlists')
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings.map((h) => [h.textContent, h.className.includes('ui-case')])).toEqual([
      ['Christmas list', false],
    ])
    expect(screen.getByText('2 books')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()

    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => within(row).queryByText(/^For /)?.textContent ?? null)).toEqual([
      null,
      'For Äiti',
    ])
    expect(within(rows[0]).getByText('Sofi Oksanen')).toBeTruthy()
    expect(getWishlist).toHaveBeenCalledWith(expect.anything(), 7)
  })

  it('shows Nothing on this list. with no open entries', async () => {
    getWishlist.mockResolvedValue({ id: 7, name: 'Christmas list', entries: [] })
    await renderPage()

    expect(screen.getByText('Nothing on this list.')).toBeTruthy()
    expect(screen.getByText('0 books')).toBeTruthy()
    expect(screen.queryAllByRole('listitem')).toEqual([])
  })

  it('shows the Back link and Load failed, and logs, when the read fails', async () => {
    const err = new Error('db down')
    getWishlist.mockRejectedValue(err)
    await renderPage()

    expect(screen.getByRole('link', { name: 'Wishlists' })).toBeTruthy()
    expect(screen.getByText("Couldn't load.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(logError).toHaveBeenCalledWith({ err }, expect.any(String))
  })

  it('redirects to /wishlists for a list that is not mine and for a bad id', async () => {
    getWishlist.mockResolvedValue(null)
    await expect(renderPage('7')).rejects.toThrow('redirect /wishlists')
    await expect(renderPage('1.5')).rejects.toThrow('redirect /wishlists')
    expect(getWishlist).toHaveBeenCalledOnce()
  })

  it('Delete confirms in a dialog, deletes the list and replaces to /wishlists', async () => {
    getWishlist.mockResolvedValue(christmas)
    deleteWishlistAction.mockResolvedValue({ ok: true, data: null })
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('The list and its 2 books go.')).toBeTruthy()
    expect(deleteWishlistAction).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/wishlists'))
    expect(deleteWishlistAction).toHaveBeenCalledExactlyOnceWith(7)
  })
})
