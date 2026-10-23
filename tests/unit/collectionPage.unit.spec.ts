// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DevicePrefs } from '@/app/(frontend)/prefs'
import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { ShelfRow, ShelfRows } from '@/lib/shelf/query'

import en from '../../messages/en.json'

const router = { replace: vi.fn(), refresh: vi.fn() }
const getShelfRows = vi.fn<() => Promise<ShelfRows>>()
const logError = vi.fn()
const devicePrefs = vi.fn<() => Promise<DevicePrefs>>()
const setDevicePrefsAction = vi.fn()
const fetchStub = vi.fn()

// The English catalogue, so the assertions read the screen's words.
const english = async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const { default: messages } = await import('../../messages/en.json')
  return (namespace?: string) =>
    createTranslator({ locale: 'en', messages, namespace: namespace as 'collection' })
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
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/payload/context', () => ({ requireUser: async () => ({}) }))
vi.mock('@/lib/shelf/getShelfRows', () => ({ getShelfRows }))
vi.mock('@/lib/errors', () => ({ logger: () => ({ error: logError }) }))
vi.mock('@/app/(frontend)/prefs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(frontend)/prefs')>()),
  devicePrefs,
}))
vi.mock('@/app/(frontend)/actions/prefs', () => ({ setDevicePrefsAction }))
// The client list's provider: no Undo and no scrolling here.
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({
    show: vi.fn(),
    dismiss: vi.fn(),
    withdraw: vi.fn(),
    onUndone: () => () => {},
  }),
}))
vi.stubGlobal('fetch', fetchStub)
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const { default: CollectionPage } = await import('@/app/(frontend)/(sections)/page')
const { DEFAULT_PREFS } = await import('@/app/(frontend)/prefs')

const book = (
  bookId: number,
  title: string,
  extra: Partial<EffectiveBook> = {},
): EffectiveBook => ({
  bookId,
  isbn13: null,
  visibility: 'shared',
  source: null,
  title,
  subtitle: null,
  authors: [{ id: 1, name: 'Väinö Linna' }],
  series: null,
  seriesIndex: null,
  genres: [],
  themes: [],
  publisher: 'WSOY',
  year: 1954,
  language: null,
  pages: null,
  description: null,
  coverUrl: null,
  overridden: [],
  ...extra,
})

const row = (
  copyId: number,
  b: EffectiveBook,
  status: 'owned' | 'ordered' = 'owned',
): ShelfRow => ({
  copy: { copyId, status, location: null, note: null, loan: null },
  book: b,
})

async function renderPage(params: Record<string, string> = {}) {
  render(await CollectionPage({ searchParams: Promise.resolve(params) }))
}

const countLine = () => screen.getByText(/\d+ books?/).closest('p') as HTMLElement

const pressed = (group: string) =>
  within(screen.getByRole('group', { name: group })).getByRole('button', { pressed: true })
    .textContent

describe('CollectionPage', () => {
  beforeEach(() => {
    devicePrefs.mockResolvedValue({ ...DEFAULT_PREFS })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    // The list keeps its place per query; each case starts without one.
    window.sessionStorage.clear()
  })

  it('shows the tools, the count and one row per copy in shelf order', async () => {
    getShelfRows.mockResolvedValue({
      rows: [
        row(11, book(1, 'Tuntematon sotilas')),
        row(12, book(2, 'Täällä Pohjantähden alla 1', { year: null })),
        row(13, book(2, 'Täällä Pohjantähden alla 1', { year: null }), 'ordered'),
      ],
      total: 3,
      labels: {},
    })
    await renderPage()

    screen.getByRole('searchbox', { name: 'Search your books' })
    expect(countLine().textContent).toBe('3 books')
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Tuntematon sotilas',
      'Täällä Pohjantähden alla 1',
      'Täällä Pohjantähden alla 1',
    ])
    within(items[0]).getByText('Väinö Linna · 1954 · WSOY')
    within(items[1]).getByText('Väinö Linna · WSOY')
    expect(within(items[1]).queryByText('Ordered')).toBeNull()
    within(items[2]).getByText('Ordered')
  })

  it('starts the list over for a new query, and keeps the rows held when only book changes', async () => {
    const page = (params: Record<string, string>) =>
      CollectionPage({ searchParams: Promise.resolve(params) })
    const answer = (copyId: number, title: string) =>
      getShelfRows.mockResolvedValueOnce({
        rows: [row(copyId, book(copyId, title))],
        total: 1,
        labels: {},
      })
    const titles = () =>
      screen.getAllByRole('listitem').map((item) => item.querySelector('p')?.textContent)

    answer(1, 'Seitsemän veljestä')
    const { rerender } = render(await page({ q: 'kivi' }))
    expect(titles()).toEqual(['Seitsemän veljestä'])

    answer(2, 'Tuntematon sotilas')
    rerender(await page({ q: 'linna' }))
    expect(titles()).toEqual(['Tuntematon sotilas'])

    answer(3, 'Sinuhe')
    rerender(await page({ q: 'linna', book: '7' }))
    expect(titles()).toEqual(['Tuntematon sotilas'])
  })

  it('renders the layout and size from the device preferences on first paint', async () => {
    devicePrefs.mockResolvedValue({ ...DEFAULT_PREFS, layout: 'covers', size: 's' })
    getShelfRows.mockResolvedValue({
      rows: [row(11, book(1, 'Tuntematon sotilas'))],
      total: 1,
      labels: {},
    })
    await renderPage()

    expect(pressed('Layout')).toBe('Covers')
    expect(pressed('Size')).toBe('S')
    const [tile] = screen.getAllByRole('listitem')
    within(tile).getByText('Tuntematon sotilas', { selector: 'p' })
    within(tile).getByText('Väinö Linna')
    expect(within(tile).queryByText(/· 1954 · WSOY/)).toBeNull()
  })

  it('switches layout and size at once, saves each, and fetches nothing', async () => {
    setDevicePrefsAction.mockResolvedValue({ ok: true, data: null })
    getShelfRows.mockResolvedValue({
      rows: [row(11, book(1, 'Tuntematon sotilas'))],
      total: 1,
      labels: {},
    })
    await renderPage()
    within(screen.getByRole('listitem')).getByText('Väinö Linna · 1954 · WSOY')

    fireEvent.click(screen.getByRole('button', { name: 'L' }))
    const item = screen.getByRole('listitem')
    within(item).getByText('Väinö Linna')
    within(item).getByText('1954 · WSOY')
    fireEvent.click(screen.getByRole('button', { name: 'Covers' }))
    await act(async () => {})

    expect(setDevicePrefsAction.mock.calls).toEqual([[{ size: 'l' }], [{ layout: 'covers' }]])
    expect(pressed('Layout')).toBe('Covers')
    expect(pressed('Size')).toBe('L')
    within(screen.getByRole('listitem')).getByText('Väinö Linna')
    expect(fetchStub).not.toHaveBeenCalled()
  })

  it('returns the switch and the list to the stored layout when the save fails', async () => {
    setDevicePrefsAction.mockResolvedValue({ ok: false, code: 'NO_CONNECTION' })
    getShelfRows.mockResolvedValue({
      rows: [row(11, book(1, 'Tuntematon sotilas'))],
      total: 1,
      labels: {},
    })
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Covers' }))
    await act(async () => {})

    expect(pressed('Layout')).toBe('Rows')
    within(screen.getByRole('listitem')).getByText('Väinö Linna · 1954 · WSOY')
  })

  it('shows First run with no copies', async () => {
    getShelfRows.mockResolvedValue({ rows: [], total: 0, labels: {} })
    await renderPage()

    expect(countLine().textContent).toBe('0 books')
    screen.getByText('No books yet')
    screen.getByText(en.collection.emptyRemark)
    expect(screen.getByRole('link', { name: 'Scan book' }).getAttribute('href')).toBe('/scan')
  })

  it('shows No matches with Clear back to / with sort kept', async () => {
    getShelfRows.mockResolvedValue({ rows: [], total: 0, labels: {} })
    await renderPage({ q: 'zzz', sort: 'title', book: '7' })

    expect(countLine().textContent).toBe('“zzz” · 0 books · Clear')
    screen.getByText('No books match')
    const clears = screen.getAllByRole('link', { name: 'Clear' })
    expect(clears).toHaveLength(2)
    for (const clear of clears) expect(clear.getAttribute('href')).toBe('/?sort=title')
  })

  it('names the active filters in the count line', async () => {
    getShelfRows.mockResolvedValue({ rows: [], total: 14, labels: { 'location:3': 'Tampere' } })
    await renderPage({ location: '3', read: 'false' })

    expect(countLine().textContent).toBe('Tampere, unread · 14 books · Clear')
  })

  it('shows Load failed when the shelf read fails, and Try again re-renders', async () => {
    getShelfRows.mockRejectedValue(new Error('down'))
    await renderPage()

    expect(logError).toHaveBeenCalledOnce()
    screen.getByRole('searchbox', { name: 'Search your books' })
    screen.getByText("Couldn't load.")
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(router.refresh).toHaveBeenCalledOnce()
  })
})
