// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  cloneElement,
  createElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DevicePrefs } from '@/app/(frontend)/prefs'
import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { CopyLine, Holdings } from '@/lib/books/holdings'
import type { ShelfRow, ShelfRows } from '@/lib/shelf/query'

import en from '../../messages/en.json'

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() }
let searchParams = new URLSearchParams()
const getShelfRows = vi.fn<() => Promise<ShelfRows>>()
const heldBook = vi.fn<(ctx: unknown, bookId: number) => Promise<EffectiveBook | undefined>>()
const getHoldings = vi.fn<(ctx: unknown, ids: number[]) => Promise<Map<number, Holdings>>>()
const logError = vi.fn()
const devicePrefs = vi.fn<() => Promise<DevicePrefs>>()
const setDevicePrefsAction = vi.fn()
const fetchStub = vi.fn()
const showToast = vi.fn()
const removeCopiesAction = vi.fn()

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
  useLocale: () => 'en',
}))
vi.mock('next-intl/server', async () => {
  const translator = await english()
  return {
    getTranslations: async (namespace?: string) => translator(namespace),
    getLocale: async () => 'en',
  }
})
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
  useSearchParams: () => searchParams,
}))
vi.mock('@/lib/payload/context', () => ({ requireUser: async () => ({}) }))
vi.mock('@/lib/shelf/getShelfRows', () => ({ getShelfRows }))
vi.mock('@/lib/shelf/filterValues', () => ({
  filterValues: async () => ({ location: [], status: [], read: [], genre: [], language: [] }),
}))
vi.mock('@/lib/errors', () => ({ logger: () => ({ error: logError }) }))
vi.mock('@/app/(frontend)/prefs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(frontend)/prefs')>()),
  devicePrefs,
}))
vi.mock('@/app/(frontend)/actions/prefs', () => ({ setDevicePrefsAction }))
vi.mock('@/app/(frontend)/(sections)/actions', () => ({
  removeCopiesAction,
  setReadAction: vi.fn(),
  setRatingAction: vi.fn(),
}))
vi.mock('@/app/(frontend)/heldBook', () => ({ heldBook }))
vi.mock('@/lib/books/holdings', () => ({ getHoldings }))
vi.mock('@/lib/books/userBookState', () => ({
  getUserBookState: async () => ({ read: false, rating: null }),
}))
// The client list's provider: no Undo and no scrolling here.
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({
    show: showToast,
    dismiss: vi.fn(),
    withdraw: vi.fn(),
    onUndone: () => () => {},
  }),
}))
// A link navigates through the router as Next's does: pushing, or replacing.
vi.mock('next/link', () => ({
  default: ({
    href,
    replace,
    scroll,
    prefetch: _prefetch,
    transitionTypes: _transitionTypes,
    ...rest
  }: ComponentProps<'a'> & {
    href: string
    replace?: boolean
    scroll?: boolean
    prefetch?: boolean
    transitionTypes?: string[]
  }) =>
    createElement('a', {
      ...rest,
      href,
      onClick: (event: MouseEvent) => {
        event.preventDefault()
        router[replace ? 'replace' : 'push'](href, { scroll })
      },
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

// The phone unless a case widens the screen: the Filter panel is a closed sheet.
let matchesScreen = (_query: string) => false
vi.stubGlobal('matchMedia', (query: string) => ({
  media: query,
  matches: matchesScreen(query),
  addEventListener: () => {},
  removeEventListener: () => {},
}))

const { default: CollectionPage } = await import('@/app/(frontend)/(sections)/page')
const { DEFAULT_PREFS } = await import('@/app/(frontend)/prefs')
const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')

/**
 * The page's tree with its async server components (Book detail) awaited,
 * as the server renderer does; the client renderer cannot run them.
 */
async function serverTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(serverTree))
  if (!isValidElement(node)) return node
  const { type, props } = node as ReactElement<{ children?: ReactNode }>
  if (typeof type === 'function' && type.constructor.name === 'AsyncFunction') {
    return serverTree(await (type as (props: unknown) => Promise<ReactNode>)(props))
  }
  if (props.children === undefined) return node
  const children = await serverTree(props.children)
  return Array.isArray(children)
    ? cloneElement(node, undefined, ...(children as ReactNode[]))
    : cloneElement(node, undefined, children)
}

const page = async (params: Record<string, string>) =>
  serverTree(await CollectionPage({ searchParams: Promise.resolve(params) }))

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

const copy = (copyId: number, extra: Partial<CopyLine> = {}): CopyLine => ({
  copyId,
  status: 'owned',
  location: null,
  note: null,
  loan: null,
  ...extra,
})

/** The viewer holds `copies` of `b`: Book detail's reads. */
function holds(b: EffectiveBook, copies: CopyLine[]) {
  heldBook.mockImplementation(async (_, bookId) => (bookId === b.bookId ? b : undefined))
  getHoldings.mockImplementation(
    async (_, ids) => new Map(ids.map((id) => [id, { copies, entries: [] }])),
  )
}

async function renderPage(params: Record<string, string> = {}) {
  return render(await page(params))
}

const detail = (name: string) => screen.findByRole('dialog', { name })

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
    heldBook.mockReset()
    getHoldings.mockReset()
    // The list keeps its place per query; each case starts without one.
    window.sessionStorage.clear()
    searchParams = new URLSearchParams()
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
    const answer = (copyId: number, title: string) =>
      getShelfRows.mockResolvedValueOnce({
        rows: [row(copyId, book(copyId, title))],
        total: 1,
        labels: {},
      })
    const titles = () =>
      screen
        .getAllByRole('listitem')
        .filter((item) => !item.closest('[role="dialog"]'))
        .map((item) => item.querySelector('p')?.textContent)

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

  it('ticks copies in select mode, keeps them across queries, and clears on Done or Esc', async () => {
    const page = (params: Record<string, string>) =>
      CollectionPage({ searchParams: Promise.resolve(params) })
    const both = {
      rows: [row(11, book(1, 'Sinuhe')), row(12, book(2, 'Kätilö'))],
      total: 2,
      labels: {},
    }
    const box = (title: string) => screen.getByRole('checkbox', { name: new RegExp(title) })
    const selected = () => screen.queryByText(/\d+ selected/)?.textContent
    const tap = (title: string) => screen.getByText(title, { selector: 'p' })

    getShelfRows.mockResolvedValueOnce(both)
    const { rerender } = render(await page({}))
    expect(screen.queryByRole('checkbox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(selected()).toBe('0 selected')
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull()

    fireEvent.click(tap('Sinuhe'))
    expect((box('Sinuhe') as HTMLInputElement).checked).toBe(true)
    expect(selected()).toBe('1 selected')
    fireEvent.click(tap('Sinuhe'))
    expect((box('Sinuhe') as HTMLInputElement).checked).toBe(false)
    expect(selected()).toBe('0 selected')
    fireEvent.click(tap('Sinuhe'))
    fireEvent.click(tap('Kätilö'))
    expect(selected()).toBe('2 selected')

    getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]], total: 1, labels: {} })
    rerender(await page({ q: 'sinuhe' }))
    expect(screen.queryByText('Kätilö')).toBeNull()
    expect(selected()).toBe('2 selected')

    getShelfRows.mockResolvedValueOnce(both)
    rerender(await page({}))
    expect((box('Kätilö') as HTMLInputElement).checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(selected()).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(selected()).toBe('0 selected')
    fireEvent.click(tap('Sinuhe'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('checkbox')).toBeNull()
    screen.getByRole('button', { name: 'Select' })
    expect(router.replace).not.toHaveBeenCalled()
  })

  describe('Remove in select mode', () => {
    const both = {
      rows: [row(11, book(1, 'Sinuhe')), row(12, book(2, 'Kätilö'))],
      total: 2,
      labels: {},
    }
    const selected = () => screen.queryByText(/\d+ selected/)?.textContent
    const tap = (title: string) => fireEvent.click(screen.getByText(title, { selector: 'p' }))
    const removeButton = () => screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement
    /** The reload after the action: `fetchStub` answers `/data/shelf`. */
    const reloadsWith = (shelf: ShelfRows) =>
      fetchStub.mockResolvedValue({ status: 200, json: async () => ({ ok: true, data: shelf }) })
    const confirm = async (title: string) => {
      fireEvent.click(removeButton())
      const dialog = await screen.findByRole('dialog', { name: title })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }

    it('asks first, then removes every ticked copy, in view or not, and keeps selecting', async () => {
      const page = (params: Record<string, string>) =>
        CollectionPage({ searchParams: Promise.resolve(params) })
      removeCopiesAction.mockResolvedValue({ ok: true, data: null })
      reloadsWith({ rows: [], total: 0, labels: {} })
      getShelfRows.mockResolvedValueOnce(both)
      const { rerender } = render(await page({}))
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      expect(removeButton().disabled).toBe(true)

      tap('Sinuhe')
      tap('Kätilö')
      fireEvent.click(removeButton())
      const dialog = await screen.findByRole('dialog', { name: 'Remove 2 books from library?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(removeCopiesAction).not.toHaveBeenCalled()
      expect(selected()).toBe('2 selected')

      getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]], total: 1, labels: {} })
      rerender(await page({ q: 'sinuhe' }))
      await confirm('Remove 2 books from library?')

      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([11, 12])
      await waitFor(() => expect(screen.queryByText('Sinuhe', { selector: 'p' })).toBeNull())
      expect(fetchStub.mock.calls[0]![0]).toMatch(/^\/data\/shelf\?q=sinuhe&/)
      screen.getByRole('button', { name: 'Done' })
      expect(showToast).not.toHaveBeenCalled()
    })

    it('keeps the ticks when the call fails, and clears them when a copy is gone', async () => {
      getShelfRows.mockResolvedValue(both)
      reloadsWith({ rows: [both.rows[1]], total: 1, labels: {} })
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')

      removeCopiesAction.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await confirm('Remove 1 book from library?')
      await waitFor(() =>
        expect(showToast).toHaveBeenCalledWith({ kind: 'error', code: 'NO_CONNECTION' }),
      )
      expect(selected()).toBe('1 selected')
      expect(fetchStub).not.toHaveBeenCalled()

      removeCopiesAction.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' })
      await confirm('Remove 1 book from library?')
      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(showToast).toHaveBeenCalledWith({ kind: 'success', message: 'Not in library' })
      await waitFor(() => expect(screen.queryByText('Sinuhe', { selector: 'p' })).toBeNull())
      expect(fetchStub).toHaveBeenCalledOnce()
    })
  })

  it('ticks a cover tile in select mode', async () => {
    devicePrefs.mockResolvedValue({ ...DEFAULT_PREFS, layout: 'covers' })
    getShelfRows.mockResolvedValue({ rows: [row(11, book(1, 'Sinuhe'))], total: 1, labels: {} })
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByText('Sinuhe', { selector: 'p' }))
    expect((screen.getByRole('checkbox', { name: /Sinuhe/ }) as HTMLInputElement).checked).toBe(
      true,
    )
    screen.getByText('1 selected')
  })

  it('closes Book detail on entering select mode', async () => {
    searchParams = new URLSearchParams({ sort: 'title', book: '5' })
    getShelfRows.mockResolvedValue({ rows: [row(11, book(1, 'Sinuhe'))], total: 1, labels: {} })
    await renderPage({ sort: 'title', book: '5' })

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(router.replace).toHaveBeenCalledWith('/?sort=title', { scroll: false })
    expect(router.back).not.toHaveBeenCalled()
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

  describe('Book detail', () => {
    const linna = book(5, 'Tuntematon sotilas', {
      series: { id: 2, name: 'Sotaromaanit' },
      seriesIndex: 1,
      pages: 474,
      language: 'fin',
    })

    it('opens over the list with the header, Your copies and Edit', async () => {
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      holds(linna, [
        copy(21, { location: { id: 3, name: 'Tampere' } }),
        copy(22, { status: 'ordered' }),
      ])
      await renderPage({ book: '5' })

      const sheet = await detail('Tuntematon sotilas')
      within(sheet).getByRole('heading', { name: 'Tuntematon sotilas' })
      within(sheet).getByText('Väinö Linna')
      within(sheet).getByText('Sotaromaanit 1')
      within(sheet).getByText('WSOY · 1954 · 474 pages · fin')
      expect(
        within(sheet)
          .getAllByRole('listitem')
          .map((line) => line.textContent),
      ).toEqual(['Tampere · Owned', 'Ordered'])
      expect(within(sheet).getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
        '/books/5/edit',
      )
      expect(getHoldings).toHaveBeenCalledWith(expect.anything(), [5])
    })

    it('opens from a row, pushing, and swaps the Book open, replacing', async () => {
      const other = book(6, 'Sinuhe')
      getShelfRows.mockResolvedValue({
        rows: [row(11, linna), row(12, other)],
        total: 2,
        labels: {},
      })
      const { unmount } = await renderPage({ q: 'a' })
      fireEvent.click(screen.getByRole('link', { name: /Tuntematon sotilas/ }))
      expect(router.push).toHaveBeenCalledWith('/?q=a&book=5', { scroll: false })
      unmount()

      holds(other, [copy(22)])
      await renderPage({ q: 'a', book: '6' })
      await detail('Sinuhe')
      const rowLink = screen.getAllByRole('link', { name: /Tuntematon sotilas/, hidden: true })[0]
      fireEvent.click(rowLink)
      expect(router.replace).toHaveBeenCalledWith('/?q=a&book=5', { scroll: false })
      expect(router.push).toHaveBeenCalledOnce()
    })

    it('toasts Not in library for a Book not held and leaves book', async () => {
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      heldBook.mockResolvedValue(undefined)
      await renderPage({ q: 'linna', book: '99' })

      expect(heldBook).toHaveBeenCalledWith(expect.anything(), 99)
      expect(countLine().textContent).toBe('“linna” · 1 book · Clear')
      expect(showToast).toHaveBeenCalledWith({ kind: 'success', message: 'Not in library' })
      expect(router.replace).toHaveBeenCalledWith('/?q=linna', { scroll: false })
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('stays open when its row no longer matches', async () => {
      getShelfRows.mockResolvedValue({
        rows: [row(12, book(7, 'Seitsemän veljestä'))],
        total: 1,
        labels: {},
      })
      holds(linna, [copy(21)])
      await renderPage({ q: 'kivi', book: '5' })

      await detail('Tuntematon sotilas')
      expect(
        screen.getAllByRole('link', { hidden: true }).map((link) => link.getAttribute('href')),
      ).not.toContain('/?q=kivi&book=5')
    })

    it('closes back to the list: history back with an in-app entry, else replacing', async () => {
      installNavigationTracking()
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      holds(linna, [copy(21)])
      const close = async () => {
        const sheet = await detail('Tuntematon sotilas')
        fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      }

      const { unmount } = await renderPage({ q: 'linna', book: '5' })
      await close()
      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith('/?q=linna', { scroll: false }),
      )
      expect(router.back).not.toHaveBeenCalled()
      unmount()

      // The row's push: an in-app entry below.
      window.history.pushState(null, '', '/?q=linna&book=5')
      await renderPage({ q: 'linna', book: '5' })
      await close()
      await waitFor(() => expect(router.back).toHaveBeenCalledOnce())
      expect(router.replace).toHaveBeenCalledOnce()
      // Settle the back as the browser would, so later cases start at depth 0.
      act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: null })))
    })

    describe('beside the list at 1300px', () => {
      const sinuhe = book(6, 'Sinuhe')
      const panel = (name: string) => screen.findByRole('complementary', { name })

      beforeEach(() => {
        // Wide, with room for Filter and Book detail together.
        matchesScreen = (query) => !query.includes('1200px')
        getShelfRows.mockResolvedValue({
          rows: [row(11, linna), row(12, sinuhe)],
          total: 2,
          labels: {},
        })
        heldBook.mockImplementation(async (_, bookId) =>
          [linna, sinuhe].find((b) => b.bookId === bookId),
        )
        getHoldings.mockImplementation(
          async (_, ids) =>
            new Map(ids.map((id) => [id, { copies: [copy(20 + id)], entries: [] }])),
        )
      })

      afterEach(() => {
        matchesScreen = () => false
      })

      it('opens as a panel beside the list, not a dialog', async () => {
        await renderPage({ book: '5' })

        const aside = await panel('Tuntematon sotilas')
        within(aside).getByRole('heading', { name: 'Tuntematon sotilas' })
        within(aside).getByRole('heading', { name: 'Your copies' })
        within(aside).getByRole('link', { name: 'Edit' })
        expect(screen.queryByRole('dialog')).toBeNull()
        // Not hidden from assistive technology: the list stays operable.
        fireEvent.click(screen.getByRole('link', { name: /Sinuhe/ }))
        expect(router.replace).toHaveBeenCalledWith('/?book=6', { scroll: false })
      })

      it('swaps the Book in the same panel without closing', async () => {
        searchParams = new URLSearchParams('book=5')
        const { rerender } = await renderPage({ book: '5' })
        const aside = await panel('Tuntematon sotilas')

        searchParams = new URLSearchParams('book=6')
        rerender(await page({ book: '6' }))
        expect(await panel('Sinuhe')).toBe(aside)
        within(aside).getByRole('heading', { name: 'Sinuhe' })
        expect(router.back).not.toHaveBeenCalled()
        expect(router.replace).not.toHaveBeenCalled()
      })

      it('closes on X, replacing without book', async () => {
        await renderPage({ q: 'linna', book: '5' })

        fireEvent.click(
          within(await panel('Tuntematon sotilas')).getByRole('button', { name: 'Close' }),
        )
        await waitFor(() =>
          expect(router.replace).toHaveBeenCalledWith('/?q=linna', { scroll: false }),
        )
      })

      it('closes on Esc from a row, not from the search field', async () => {
        await renderPage({ book: '5' })
        await panel('Tuntematon sotilas')

        fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
        // The leave runs after the transitions settle, a microtask later.
        await act(async () => {})
        expect(router.replace).not.toHaveBeenCalled()
        fireEvent.keyDown(screen.getByRole('link', { name: /Sinuhe/ }), { key: 'Escape' })
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/', { scroll: false }))
      })

      it('toasts Not in library for a Book not held, with no panel', async () => {
        await renderPage({ book: '99' })

        expect(showToast).toHaveBeenCalledWith({ kind: 'success', message: 'Not in library' })
        expect(router.replace).toHaveBeenCalledWith('/', { scroll: false })
        expect(screen.queryByRole('complementary', { name: /./ })).toBeNull()
      })
    })
  })
})
