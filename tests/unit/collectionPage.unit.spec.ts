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
import type { CopyLine, EntryLine, Holdings } from '@/lib/books/holdings'
import type { LocationOption } from '@/lib/copies/locations'
import { helsinkiToday } from '@/lib/loans/dates'
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
const toggleCopiesReadAction = vi.fn()
const setNoteAction = vi.fn()
const receiveCopyAction = vi.fn()
const moveCopiesAction = vi.fn()
const listLocations = vi.fn<(ctx: unknown) => Promise<LocationOption[]>>()
const lendingPeople = vi.fn<(ctx: unknown) => Promise<{ id: number; name: string }[]>>()
const lendCopyAction = vi.fn()
const returnLoanAction = vi.fn()
/** The signed-in viewer: a plain user unless a case makes them the admin. */
const requireUser = vi.fn<() => Promise<{ user: { roles: ('admin' | 'user')[] } }>>()

// The English catalogue, so the assertions read the screen's words.
const english = async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const { default: messages } = await import('../../messages/en.json')
  return (namespace?: string) =>
    createTranslator({ locale: 'en', messages, namespace: namespace as 'collection' })
}

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return {
    ...actual,
    useTranslations: await english(),
    useLocale: () => 'en',
    useFormatter: () => actual.createFormatter({ locale: 'en' }),
  }
})
vi.mock('next-intl/server', async () => {
  const translator = await english()
  return {
    getTranslations: async (namespace?: string) => translator(namespace),
    getLocale: async () => 'en',
    getFormatter: async () => {
      const { createFormatter } = await vi.importActual<typeof import('next-intl')>('next-intl')
      return createFormatter({ locale: 'en', timeZone: 'Europe/Helsinki' })
    },
  }
})
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
  usePathname: () => '/',
  useSearchParams: () => searchParams,
}))
vi.mock('@/lib/payload/context', () => ({ requireUser }))
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
  receiveCopyAction,
  setReadAction: vi.fn(),
  setRatingAction: vi.fn(),
  setNoteAction,
  toggleCopiesReadAction,
  moveCopiesAction,
}))
vi.mock('@/lib/copies/locations', () => ({ listLocations }))
vi.mock('@/lib/people/people', () => ({ lendingPeople }))
vi.mock('@/lib/loans/loans', () => ({ returnedLoans: async () => [] }))
vi.mock('@/app/(frontend)/actions/loans', () => ({ lendCopyAction, returnLoanAction }))
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
    onClick,
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
      onClick: (event: Parameters<NonNullable<typeof onClick>>[0]) => {
        onClick?.(event)
        if (event.defaultPrevented) return
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
  location: CopyLine['location'] = null,
): ShelfRow => ({
  copy: { copyId, status, location, note: null, loan: null },
  book: b,
})

const antti: CopyLine['loan'] = {
  loanId: 31,
  person: { id: 32, name: 'Antti' },
  since: '2026-10-01',
}

/** `r` with an open loan to Antti. */
const lentRow = (r: ShelfRow): ShelfRow => ({ ...r, copy: { ...r.copy, loan: antti } })

const copy = (copyId: number, extra: Partial<CopyLine> = {}): CopyLine => ({
  copyId,
  status: 'owned',
  location: null,
  note: null,
  loan: null,
  ...extra,
})

/** The viewer holds `copies` and open `entries` of `b`: Book detail's reads. */
function holds(b: EffectiveBook, copies: CopyLine[], entries: EntryLine[] = []) {
  heldBook.mockImplementation(async (_, bookId) => (bookId === b.bookId ? b : undefined))
  getHoldings.mockImplementation(
    async (_, ids) => new Map(ids.map((id) => [id, { copies, entries }])),
  )
}

/** Liisa's entry on Joululahjat, then the viewer's own on Luettavat. */
const ENTRIES: EntryLine[] = [
  { entryId: 51, wishlist: { id: 4, name: 'Joululahjat' }, forPerson: { id: 41, name: 'Liisa' } },
  { entryId: 52, wishlist: { id: 7, name: 'Luettavat' }, forPerson: null },
]

/** Book detail's On wishlists group, by its heading. */
const onWishlists = (sheet: HTMLElement) =>
  within(sheet).getByRole('heading', { name: 'On wishlists' }).closest('section') as HTMLElement

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
    listLocations.mockResolvedValue([])
    lendingPeople.mockResolvedValue([])
    requireUser.mockResolvedValue({ user: { roles: ['user'] } })
  })

  afterEach(async () => {
    cleanup()
    // A reset, not a clear: a case that fails early leaves `…Once` results
    // queued, and a clear would hand them to the next case.
    vi.resetAllMocks()
    // An overlay unmounted while open leaves its history entry, and a back
    // with no traversal stays in flight: settle both as a browser back would,
    // so the next case's close starts at depth 0 and replaces.
    window.history.replaceState(null, '')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    // The list keeps its place per query; each case starts without one.
    window.sessionStorage.clear()
    searchParams = new URLSearchParams()
  })

  it('shows the tools, the count and one row per copy in shelf order', async () => {
    getShelfRows.mockResolvedValue({
      rows: [
        row(11, book(1, 'Tuntematon sotilas'), 'owned', { id: 2, name: 'Tampere' }),
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
    within(items[0]).getByText('Tampere')
    within(items[1]).getByText('Väinö Linna · WSOY')
    // Owned with no location: no ending.
    expect(items[1].textContent?.endsWith('Väinö Linna · WSOY')).toBe(true)
    within(items[2]).getByText('Ordered')
  })

  it('ends a lent row with the marker and its borrower in place of the location', async () => {
    const tampere = { id: 2, name: 'Tampere' }
    getShelfRows.mockResolvedValue({
      rows: [
        lentRow(row(11, book(1, 'Tuntematon sotilas'), 'owned', tampere)),
        row(12, book(2, 'Sinuhe'), 'owned', tampere),
        lentRow(row(13, book(3, 'Seitsemän veljestä'), 'ordered')),
        lentRow(row(14, book(4, 'Taikatalvi'))),
      ],
      total: 4,
      labels: {},
    })
    await renderPage()

    const items = screen.getAllByRole('listitem')
    expect(items[0].textContent?.endsWith('Lent · Antti')).toBe(true)
    expect(within(items[0]).queryByText('Tampere')).toBeNull()
    expect(items[1].textContent?.endsWith('Tampere')).toBe(true)
    expect(items[2].textContent?.endsWith('Ordered')).toBe(true)
    expect(within(items[2]).queryByText(/Lent/)).toBeNull()
    expect(items[3].textContent?.endsWith('Lent · Antti')).toBe(true)

    // Select mode keeps the ending beside the checkbox.
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    const ticking = screen.getAllByRole('listitem')
    within(ticking[0]).getByRole('checkbox')
    expect(ticking[0].textContent?.endsWith('Lent · Antti')).toBe(true)
  })

  it("shows a lent tile's borrower", async () => {
    devicePrefs.mockResolvedValue({ ...DEFAULT_PREFS, layout: 'covers' })
    getShelfRows.mockResolvedValue({
      rows: [
        lentRow(row(11, book(1, 'Tuntematon sotilas'))),
        lentRow(row(12, book(2, 'Sinuhe'), 'ordered')),
      ],
      total: 2,
      labels: {},
    })
    await renderPage()

    const [lent, ordered] = screen.getAllByRole('listitem')
    within(lent).getByText('Lent · Antti')
    expect(within(ordered).queryByText(/Lent/)).toBeNull()
    within(ordered).getByText('Ordered')
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
    within(screen.getByRole('listitem')).getByText('Väinö Linna', { selector: 'p' })
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
    // No locations: no Move.
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull()
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

  describe('Read and Remove in select mode', () => {
    const both = {
      rows: [row(11, book(1, 'Sinuhe')), row(12, book(2, 'Kätilö'))],
      total: 2,
      labels: {},
    }
    const selected = () => screen.queryByText(/\d+ selected/)?.textContent
    const tap = (title: string) => fireEvent.click(screen.getByText(title, { selector: 'p' }))
    const removeButton = () => screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement
    const readButton = () => screen.getByRole('button', { name: 'Read' }) as HTMLButtonElement
    const toggled = (read: boolean, count: number) => ({
      ok: true,
      data: { read, count, undoToken: `token-${count}`, undoSeconds: 1800 },
    })
    /** The reload after the action: `fetchStub` answers `/data/shelf`. */
    const reloadsWith = (shelf: ShelfRows) =>
      fetchStub.mockResolvedValue({ status: 200, json: async () => ({ ok: true, data: shelf }) })
    const confirm = async (title: string) => {
      fireEvent.click(removeButton())
      const dialog = await screen.findByRole('dialog', { name: title })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }

    it('toggles read on every ticked copy, in view or not, with Undo, and keeps selecting', async () => {
      const page = (params: Record<string, string>) =>
        CollectionPage({ searchParams: Promise.resolve(params) })
      toggleCopiesReadAction.mockResolvedValueOnce(toggled(true, 2))
      reloadsWith(both)
      getShelfRows.mockResolvedValueOnce(both)
      const { rerender } = render(await page({}))
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      expect(readButton().disabled).toBe(true)

      tap('Sinuhe')
      tap('Kätilö')
      getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]], total: 1, labels: {} })
      rerender(await page({ q: 'sinuhe' }))
      readButton().focus()
      fireEvent.click(readButton())

      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(toggleCopiesReadAction).toHaveBeenCalledExactlyOnceWith([11, 12])
      expect(showToast).toHaveBeenCalledExactlyOnceWith({
        kind: 'success',
        message: 'Marked 2 read',
        undo: { token: 'token-2', seconds: 1800 },
      })
      await waitFor(() => expect(fetchStub).toHaveBeenCalledOnce())
      expect(fetchStub.mock.calls[0]![0]).toMatch(/^\/data\/shelf\?q=sinuhe&/)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' }))
      expect(readButton().disabled).toBe(true)

      toggleCopiesReadAction.mockResolvedValueOnce(toggled(false, 1))
      tap('Sinuhe')
      fireEvent.click(readButton())
      await waitFor(() =>
        expect(showToast).toHaveBeenLastCalledWith({
          kind: 'success',
          message: 'Marked 1 unread',
          undo: { token: 'token-1', seconds: 1800 },
        }),
      )
      expect(toggleCopiesReadAction).toHaveBeenLastCalledWith([11])
    })

    it('keeps the ticks when Read fails, and clears them when a copy is gone', async () => {
      getShelfRows.mockResolvedValue(both)
      reloadsWith({ rows: [both.rows[1]], total: 1, labels: {} })
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')

      toggleCopiesReadAction.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      fireEvent.click(readButton())
      await waitFor(() =>
        expect(showToast).toHaveBeenCalledWith({ kind: 'error', code: 'NO_CONNECTION' }),
      )
      expect(selected()).toBe('1 selected')
      expect(fetchStub).not.toHaveBeenCalled()

      toggleCopiesReadAction.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' })
      fireEvent.click(readButton())
      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(showToast).toHaveBeenCalledWith({ kind: 'success', message: 'Not in library' })
      await waitFor(() => expect(screen.queryByText('Sinuhe', { selector: 'p' })).toBeNull())
      expect(fetchStub).toHaveBeenCalledOnce()
    })

    it('asks first, then removes every ticked copy, in view or not, and keeps selecting', async () => {
      const page = (params: Record<string, string>) =>
        CollectionPage({ searchParams: Promise.resolve(params) })
      removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 2, skipped: [] } })
      reloadsWith({ rows: [], total: 0, labels: {} })
      getShelfRows.mockResolvedValueOnce(both)
      const { rerender } = render(await page({}))
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      expect(removeButton().disabled).toBe(true)

      tap('Sinuhe')
      tap('Kätilö')
      fireEvent.click(removeButton())
      const dialog = await screen.findByRole('dialog', { name: 'Remove 2 books from library?' })
      expect(within(dialog).queryByText('Their loans go too.')).toBeNull()
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
      // AD-7: the bar's Remove refreshes the server render once the rows reloaded,
      // so Back to the collection finds the cached first page without the removed copies.
      await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
    })

    it('says the loans go too when a ticked copy was lent, though out of view', async () => {
      const page = (params: Record<string, string>) =>
        CollectionPage({ searchParams: Promise.resolve(params) })
      const lent = row(12, book(2, 'Kätilö'))
      lent.copy.loan = { loanId: 31, person: { id: 41, name: 'Liisa' }, since: '2026-10-20' }
      getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]!, lent], total: 2, labels: {} })
      const { rerender } = render(await page({}))
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')
      tap('Kätilö')

      getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]!], total: 1, labels: {} })
      rerender(await page({ q: 'sinuhe' }))
      await waitFor(() => expect(screen.queryByText('Kätilö', { selector: 'p' })).toBeNull())
      fireEvent.click(removeButton())
      const dialog = await screen.findByRole('dialog', { name: 'Remove 2 books from library?' })
      within(dialog).getByText('Their loans go too.')
    })

    it('skips an ordered copy, which stays ticked, and says so in the toast', async () => {
      getShelfRows.mockResolvedValue({
        rows: [both.rows[0]!, row(12, book(2, 'Kätilö'), 'ordered')],
        total: 2,
        labels: {},
      })
      removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 1, skipped: [12] } })
      reloadsWith({ rows: [row(12, book(2, 'Kätilö'), 'ordered')], total: 1, labels: {} })
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')
      tap('Kätilö')

      await confirm('Remove 2 books from library?')
      await waitFor(() => expect(selected()).toBe('1 selected'))
      expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([11, 12])
      expect(showToast).toHaveBeenCalledExactlyOnceWith({
        kind: 'success',
        message: '1 removed · 1 ordered skipped',
      })
      expect((screen.getByRole('checkbox', { name: /Kätilö/ }) as HTMLInputElement).checked).toBe(
        true,
      )
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

  describe('Move', () => {
    const both = {
      rows: [row(11, book(1, 'Sinuhe')), row(12, book(2, 'Kätilö'))],
      total: 2,
      labels: {},
    }
    const selected = () => screen.queryByText(/\d+ selected/)?.textContent
    const tap = (title: string) => fireEvent.click(screen.getByText(title, { selector: 'p' }))
    const reloadsWith = (shelf: ShelfRows) =>
      fetchStub.mockResolvedValue({ status: 200, json: async () => ({ ok: true, data: shelf }) })
    const moved = (id: number, name: string, count: number, skipped: number[] = []) => ({
      ok: true,
      data: {
        location: { id, name },
        count,
        skipped,
        undoToken: `token-${name}`,
        undoSeconds: 1800,
      },
    })
    /** Opens the bar's Move picker, once the last action's reload has let go of the bar. */
    const openMove = async () => {
      const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Move' })
      await waitFor(() => expect(button.disabled).toBe(false))
      fireEvent.click(button)
      return screen.findByRole('dialog', { name: 'Move to' })
    }
    const moveTo = async (name: string) =>
      fireEvent.click(within(await openMove()).getByRole('button', { name }))

    beforeEach(() => {
      listLocations.mockResolvedValue([
        { id: 3, name: 'Kirjahylly' },
        { id: 4, name: 'Mökki' },
      ])
    })

    it('moves every ticked owned copy, to a location or a new one, skipping ordered ones', async () => {
      const page = (params: Record<string, string>) =>
        CollectionPage({ searchParams: Promise.resolve(params) })
      getShelfRows.mockResolvedValueOnce(both)
      const { rerender } = render(await page({}))
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')
      tap('Kätilö')
      getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]], total: 1, labels: {} })
      rerender(await page({ q: 'sinuhe' }))

      // Bar move: both ids, the toast with Undo, the rows reload without the moved copy.
      moveCopiesAction.mockResolvedValueOnce(moved(4, 'Mökki', 2))
      reloadsWith({ rows: [], total: 0, labels: {} })
      await moveTo('Mökki')
      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(moveCopiesAction).toHaveBeenCalledExactlyOnceWith({ copyIds: [11, 12], location: 4 })
      expect(showToast).toHaveBeenCalledExactlyOnceWith({
        kind: 'success',
        message: '2 moved to Mökki',
        undo: { token: 'token-Mökki', seconds: 1800 },
      })
      await waitFor(() => expect(screen.queryByText('Sinuhe', { selector: 'p' })).toBeNull())
      // The refresh follows the reload (AD-7).
      await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
      screen.getByRole('button', { name: 'Done' })

      // Create inline: the name as typed; the toast names the stored one.
      reloadsWith(both)
      getShelfRows.mockResolvedValueOnce(both)
      rerender(await page({}))
      await waitFor(() => screen.getByText('Sinuhe', { selector: 'p' }))
      tap('Sinuhe')
      moveCopiesAction.mockResolvedValueOnce(moved(5, 'Kellari', 1))
      const picker = await openMove()
      fireEvent.change(within(picker).getByRole('textbox', { name: 'New location' }), {
        target: { value: ' Kellari ' },
      })
      fireEvent.click(within(picker).getByRole('button', { name: 'Move' }))
      await waitFor(() =>
        expect(moveCopiesAction).toHaveBeenLastCalledWith({
          copyIds: [11],
          location: { create: ' Kellari ' },
        }),
      )
      await waitFor(() =>
        expect(showToast).toHaveBeenLastCalledWith({
          kind: 'success',
          message: '1 moved to Kellari',
          undo: { token: 'token-Kellari', seconds: 1800 },
        }),
      )

      // Ordered ticked too: the owned copy moves, the ordered one is skipped and stays ticked.
      await waitFor(() => expect(selected()).toBe('0 selected'))
      tap('Sinuhe')
      tap('Kätilö')
      moveCopiesAction.mockResolvedValueOnce(moved(4, 'Mökki', 1, [12]))
      await moveTo('Mökki')
      await waitFor(() =>
        expect(showToast).toHaveBeenLastCalledWith({
          kind: 'success',
          message: '1 moved to Mökki · 1 ordered skipped',
          undo: { token: 'token-Mökki', seconds: 1800 },
        }),
      )
      await waitFor(() => expect(selected()).toBe('1 selected'))
      expect((screen.getByRole('checkbox', { name: /Kätilö/ }) as HTMLInputElement).checked).toBe(
        true,
      )

      // Nothing owned: nothing moves, no Undo.
      moveCopiesAction.mockResolvedValueOnce({
        ok: true,
        data: { location: null, count: 0, skipped: [12], undoToken: 't0', undoSeconds: 1800 },
      })
      await moveTo('Mökki')
      await waitFor(() =>
        expect(showToast).toHaveBeenLastCalledWith({
          kind: 'success',
          message: 'Nothing moved · 1 ordered skipped',
        }),
      )
      expect(selected()).toBe('1 selected')

      // Gone meanwhile: Not in library, a reload, the ticks cleared.
      const fetches = fetchStub.mock.calls.length
      moveCopiesAction.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' })
      await moveTo('Mökki')
      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(showToast).toHaveBeenLastCalledWith({ kind: 'success', message: 'Not in library' })
      await waitFor(() => expect(fetchStub.mock.calls.length).toBe(fetches + 1))
      // One refresh per `ok` or `NOT_FOUND`, each after its reload.
      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(5))
    })

    it('closes only the picker on Esc', async () => {
      getShelfRows.mockResolvedValue(both)
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')

      const picker = await openMove()
      fireEvent.keyDown(within(picker).getByRole('button', { name: 'Mökki' }), { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(selected()).toBe('1 selected')
      expect(moveCopiesAction).not.toHaveBeenCalled()
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
      genres: [{ id: 8, name: 'Sotaromaani' }],
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
      searchParams = new URLSearchParams('q=linna&book=5')
      await renderPage({ q: 'linna', book: '5' })

      const sheet = await detail('Tuntematon sotilas')
      within(sheet).getByRole('heading', { name: 'Tuntematon sotilas' })
      expect(
        within(sheet).getByRole('link', { name: 'Sotaromaanit' }).parentElement?.textContent,
      ).toBe('Sotaromaanit 1')
      // Filter chips: each adds its value to the address's filters, without `book` in the sheet.
      const chip = (name: string) => within(sheet).getByRole('link', { name }).getAttribute('href')
      expect(chip('Väinö Linna')).toBe('/?q=linna&author=1')
      expect(chip('Sotaromaanit')).toBe('/?q=linna&series=2')
      expect(chip('Tampere')).toBe('/?q=linna&location=3')
      within(sheet).getByRole('heading', { name: 'Genres' })
      expect(chip('Sotaromaani')).toBe('/?q=linna&genre=8')
      within(sheet).getByText('WSOY · 1954 · 474 pages · Finnish')
      expect(
        within(sheet)
          .getAllByRole('listitem')
          .map((line) => line.querySelector('p')?.textContent),
      ).toEqual(['Tampere · Owned', 'Ordered'])
      expect(within(sheet).getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
        '/books/5/edit',
      )
      expect(getHoldings).toHaveBeenCalledWith(expect.anything(), [5])
      // No locations: no Move.
      expect(within(sheet).queryByRole('button', { name: 'Move' })).toBeNull()
      // No entries: no On wishlists group.
      expect(within(sheet).queryByRole('heading', { name: 'On wishlists' })).toBeNull()
    })

    it('lists the open entries under On wishlists, after Your copies', async () => {
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      holds(linna, [copy(21)], ENTRIES)
      await renderPage({ book: '5' })

      const sheet = await detail('Tuntematon sotilas')
      const headings = within(sheet)
        .getAllByRole('heading', { level: 3 })
        .map(({ textContent }) => textContent)
      expect(headings.indexOf('On wishlists')).toBe(headings.indexOf('Your copies') + 1)
      expect(
        within(onWishlists(sheet))
          .getAllByRole('listitem')
          .map(({ textContent }) => textContent),
      ).toEqual(['Joululahjat · for Liisa', 'Luettavat'])
      expect(within(onWishlists(sheet)).queryByRole('link')).toBeNull()
    })

    it('opens a Book held only through an entry, with no Your copies', async () => {
      getShelfRows.mockResolvedValue({ rows: [], total: 0, labels: {} })
      holds(linna, [], [ENTRIES[1]!])
      await renderPage({ book: '5' })

      const sheet = await detail('Tuntematon sotilas')
      expect(within(sheet).queryByRole('heading', { name: 'Your copies' })).toBeNull()
      expect(within(onWishlists(sheet)).getByRole('listitem').textContent).toBe('Luettavat')
      within(sheet).getByRole('link', { name: 'Edit' })
      within(sheet).getByRole('button', { name: 'Add to wishlist' })
    })

    it('shows Re-fetch on a shared Book with an ISBN to the admin only', async () => {
      const shared = book(5, 'Tuntematon sotilas', { isbn13: '9789510000000' })
      getShelfRows.mockResolvedValue({ rows: [row(11, shared)], total: 1, labels: {} })
      holds(shared, [copy(21)])

      requireUser.mockResolvedValue({ user: { roles: ['admin', 'user'] } })
      const { unmount } = await renderPage({ book: '5' })
      within(await detail('Tuntematon sotilas')).getByRole('button', { name: 'Re-fetch' })
      unmount()

      requireUser.mockResolvedValue({ user: { roles: ['user'] } })
      await renderPage({ book: '5' })
      expect(
        within(await detail('Tuntematon sotilas')).queryByRole('button', { name: 'Re-fetch' }),
      ).toBeNull()
    })

    it('moves one copy from its line, with Undo', async () => {
      listLocations.mockResolvedValue([
        { id: 3, name: 'Tampere' },
        { id: 4, name: 'Mökki' },
      ])
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      holds(linna, [
        copy(21, { location: { id: 3, name: 'Tampere' } }),
        copy(22, { status: 'ordered' }),
      ])
      moveCopiesAction.mockResolvedValue({
        ok: true,
        data: {
          location: { id: 4, name: 'Mökki' },
          count: 1,
          skipped: [],
          undoToken: 't',
          undoSeconds: 1800,
        },
      })
      fetchStub.mockResolvedValue({
        status: 200,
        json: async () => ({ ok: true, data: { rows: [], total: 0, labels: {} } }),
      })
      const { rerender } = await renderPage({ book: '5' })

      const sheet = await detail('Tuntematon sotilas')
      // Only the owned line has Move.
      const [move, ...others] = within(sheet).getAllByRole('button', { name: 'Move' })
      expect(others).toHaveLength(0)
      fireEvent.click(move!)
      const picker = await screen.findByRole('dialog', { name: 'Move to' })
      expect(within(picker).getByRole('button', { pressed: true }).textContent).toBe('Tampere')
      fireEvent.click(within(picker).getByRole('button', { name: 'Mökki' }))

      await waitFor(() =>
        expect(moveCopiesAction).toHaveBeenCalledExactlyOnceWith({ copyIds: [21], location: 4 }),
      )
      await waitFor(() =>
        expect(showToast).toHaveBeenCalledWith({
          kind: 'success',
          message: '1 moved to Mökki',
          undo: { token: 't', seconds: 1800 },
        }),
      )
      // `afterAction`'s refresh, once the rows reloaded.
      await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())

      // The refresh renders the line anew from the server.
      holds(linna, [
        copy(21, { location: { id: 4, name: 'Mökki' } }),
        copy(22, { status: 'ordered' }),
      ])
      rerender(await page({ book: '5' }))
      await waitFor(() =>
        expect(
          within(sheet)
            .getAllByRole('listitem')
            .map((line) => line.querySelector('p')?.textContent),
        ).toEqual(['Mökki · Owned', 'Ordered']),
      )
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
      act(() => {
        window.history.replaceState(null, '', '/?q=linna')
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
      })
      // The close settles a frame after the traversal.
      await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    })

    it('a chip closes the sheet onto the list with its filter added, replacing below', async () => {
      installNavigationTracking()
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      holds(linna, [copy(21, { location: { id: 3, name: 'Tampere' } })])
      // The row's push: an in-app entry below.
      window.history.pushState(null, '', '/?q=linna&book=5')
      searchParams = new URLSearchParams('q=linna&book=5')
      await renderPage({ q: 'linna', book: '5' })

      const sheet = await detail('Tuntematon sotilas')
      fireEvent.click(within(sheet).getByRole('link', { name: 'Tampere' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      await waitFor(() => expect(router.back).toHaveBeenCalledOnce())
      expect(router.replace).not.toHaveBeenCalled()

      // The back lands on the list below; then the chip's address replaces it.
      act(() => {
        window.history.replaceState(null, '', '/?q=linna')
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
      })
      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledExactlyOnceWith('/?q=linna&location=3', {
          scroll: false,
        }),
      )
      expect(router.push).not.toHaveBeenCalled()
    })

    describe('a copy line', () => {
      const note = () => screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement
      /** The reload after the action: `fetchStub` answers `/data/shelf`. */
      const reloads = () =>
        fetchStub.mockResolvedValue({
          status: 200,
          json: async () => ({ ok: true, data: { rows: [], total: 0, labels: {} } }),
        })
      const confirmRemove = async (sheet: HTMLElement, line = 0) => {
        fireEvent.click(within(sheet).getAllByRole('button', { name: 'Remove' })[line]!)
        const dialog = await screen.findByRole('dialog', { name: 'Remove 1 book from library?' })
        expect(within(dialog).queryByText('Its loans go too.')).toBeNull()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
      }

      beforeEach(() => {
        getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
        // The dialog's pop lands here: an entry with no in-app one below, so closing replaces.
        window.history.replaceState(null, '', '/')
      })

      it('saves the note on blur, and sends nothing when it is unchanged', async () => {
        holds(linna, [copy(21)])
        setNoteAction.mockResolvedValue({ ok: true, data: null })
        reloads()
        await renderPage({ book: '5' })
        await detail('Tuntematon sotilas')

        fireEvent.focus(note())
        fireEvent.blur(note())
        expect(setNoteAction).not.toHaveBeenCalled()

        fireEvent.change(note(), { target: { value: ' signed ' } })
        fireEvent.blur(note())
        await waitFor(() =>
          expect(setNoteAction).toHaveBeenCalledExactlyOnceWith({ copyId: 21, note: 'signed' }),
        )
        await waitFor(() => expect(note().value).toBe('signed'))
        await waitFor(() => expect(fetchStub).toHaveBeenCalledOnce())
        fireEvent.blur(note())
        expect(setNoteAction).toHaveBeenCalledOnce()
      })

      it('keeps the typed note when the save fails, and tries again on the next blur', async () => {
        holds(linna, [copy(21, { note: 'old' })])
        setNoteAction
          .mockResolvedValueOnce({ ok: false, code: 'INTERNAL' })
          .mockResolvedValue({ ok: true, data: null })
        reloads()
        await renderPage({ book: '5' })
        await detail('Tuntematon sotilas')
        expect(note().value).toBe('old')

        fireEvent.change(note(), { target: { value: 'signed' } })
        fireEvent.blur(note())
        await waitFor(() =>
          expect(showToast).toHaveBeenCalledWith({ kind: 'error', code: 'INTERNAL' }),
        )
        expect(note().value).toBe('signed')
        fireEvent.blur(note())
        await waitFor(() => expect(setNoteAction).toHaveBeenCalledTimes(2))
        expect(setNoteAction).toHaveBeenLastCalledWith({ copyId: 21, note: 'signed' })
        // Saved, so unmounting sends nothing into the next case.
        await waitFor(() => expect(fetchStub).toHaveBeenCalledOnce())
      })

      it('removes one of two copies after the dialog and keeps Book detail open', async () => {
        holds(linna, [copy(21), copy(22)])
        removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 1, skipped: [] } })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        await confirmRemove(sheet)
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([21])
        expect(showToast).not.toHaveBeenCalled()
        await detail('Tuntematon sotilas')
        expect(router.replace).not.toHaveBeenCalled()
        expect(router.back).not.toHaveBeenCalled()
      })

      it('shows a lent copy with its borrower and date, and Returned only', async () => {
        holds(linna, [
          copy(21, {
            loan: { loanId: 31, person: { id: 41, name: 'Liisa' }, since: '2026-10-20' },
          }),
        ])
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        within(sheet).getByText('Lent to Liisa since Oct 20, 2026')
        within(sheet).getByRole('button', { name: 'Returned' })
        for (const name of ['Lend', 'Move', 'Remove']) {
          expect(within(sheet).queryByRole('button', { name })).toBeNull()
        }
      })

      describe('Lend', () => {
        const nine = ['Antti', 'Leena', 'Bea', 'Äiti', 'Kalle', 'Ville', 'Aino', 'Eero', 'Olli']
        const lent = (name: string) => ({
          ok: true,
          data: { loanId: 31, person: { id: 41, name }, undoToken: 'tok', undoSeconds: 1800 },
        })
        const openPicker = async () => {
          holds(linna, [copy(21, { location: { id: 3, name: 'Tampere' } })])
          reloads()
          await renderPage({ book: '5' })
          const sheet = await detail('Tuntematon sotilas')
          fireEvent.click(within(sheet).getByRole('button', { name: 'Lend' }))
          return screen.findByRole('dialog', { name: 'Lend' })
        }

        it('shows six People and Find a person, and lends to the marked one with Undo', async () => {
          lendingPeople.mockResolvedValue(nine.map((name, i) => ({ id: 40 + i, name })))
          lendCopyAction.mockResolvedValue(lent('Antti'))
          const picker = await openPicker()

          within(picker).getByText('Tuntematon sotilas · Tampere')
          const rows = within(picker).getAllByRole('button', { pressed: false })
          expect(rows.map((row) => row.textContent)).toEqual(nine.slice(0, 6))
          within(picker).getByRole('button', { name: 'Find a person…' })
          const lend = within(picker).getByRole('button', { name: 'Lend' })
          expect(lend).toHaveProperty('disabled', true)

          fireEvent.click(within(picker).getByRole('button', { name: 'Antti' }))
          expect(lend).toHaveProperty('disabled', false)
          fireEvent.click(lend)

          await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
          expect(lendCopyAction).toHaveBeenCalledExactlyOnceWith({
            copyId: 21,
            person: 40,
            lentOn: helsinkiToday(),
          })
          expect(showToast).toHaveBeenCalledExactlyOnceWith({
            kind: 'success',
            message: 'Lent to Antti',
            undo: { token: 'tok', seconds: 1800 },
          })
        })

        it('finds any of the People in the Combobox and lends to the one chosen', async () => {
          lendingPeople.mockResolvedValue(nine.map((name, i) => ({ id: 40 + i, name })))
          lendCopyAction.mockResolvedValue(lent('Olli'))
          const picker = await openPicker()

          fireEvent.click(within(picker).getByRole('button', { name: 'Find a person…' }))
          const person = await within(picker).findByRole('combobox', { name: 'Person' })
          await waitFor(() => expect(document.activeElement).toBe(person))
          fireEvent.keyDown(person, { key: 'ArrowDown' })
          await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(9))
          expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(nine)

          fireEvent.click(screen.getByRole('option', { name: 'Olli' }))
          expect(within(picker).queryByRole('button', { pressed: true })).toBeNull()
          fireEvent.click(within(picker).getByRole('button', { name: 'Lend' }))
          await waitFor(() =>
            expect(lendCopyAction).toHaveBeenCalledExactlyOnceWith({
              copyId: 21,
              person: 48,
              lentOn: helsinkiToday(),
            }),
          )
          await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        })

        it('sends a typed name and keeps the picker open on a field error', async () => {
          lendCopyAction
            .mockResolvedValueOnce({
              ok: false,
              code: 'VALIDATION',
              fields: { lentOn: 'VALIDATION' },
            })
            .mockResolvedValueOnce({
              ok: false,
              code: 'VALIDATION',
              fields: { person: 'TOO_LONG' },
            })
          const picker = await openPicker()

          fireEvent.change(within(picker).getByLabelText('New person'), {
            target: { value: 'Liisa' },
          })
          fireEvent.click(within(picker).getByRole('button', { name: 'Lend' }))
          await within(picker).findByText("Can't be later than today.")
          expect(lendCopyAction).toHaveBeenCalledWith(
            expect.objectContaining({ copyId: 21, person: { create: 'Liisa' } }),
          )

          // The error shows before the lend's transition lets go of the button.
          const lend = within(picker).getByRole<HTMLButtonElement>('button', { name: 'Lend' })
          await waitFor(() => expect(lend.disabled).toBe(false))
          fireEvent.click(lend)
          const tooLong = await within(picker).findByText('Too long.')
          expect(within(picker).getByLabelText('New person').getAttribute('aria-describedby')).toBe(
            tooLong.id,
          )
          expect(picker.isConnected).toBe(true)
          expect(showToast).not.toHaveBeenCalled()
          fireEvent.click(within(picker).getByRole('button', { name: 'Close' }))
          await waitFor(() => expect(picker.isConnected).toBe(false))
        })
      })

      it('returns a lent copy with a toast that undoes it', async () => {
        holds(linna, [
          copy(21, {
            loan: { loanId: 31, person: { id: 41, name: 'Liisa' }, since: '2026-10-20' },
          }),
        ])
        returnLoanAction.mockResolvedValue({
          ok: true,
          data: { loanId: 31, undoToken: 'tok', undoSeconds: 1800 },
        })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        fireEvent.click(within(sheet).getByRole('button', { name: 'Returned' }))
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(returnLoanAction).toHaveBeenCalledExactlyOnceWith({ loanId: 31 })
        expect(showToast).toHaveBeenCalledExactlyOnceWith({
          kind: 'success',
          message: 'Returned',
          undo: { token: 'tok', seconds: 1800 },
        })
      })

      it('closes Book detail after removing the last copy, and reloads the rows', async () => {
        holds(linna, [copy(21)])
        removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 1, skipped: [] } })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        await confirmRemove(sheet)
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/', { scroll: false }))
        expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([21])
        expect(fetchStub.mock.calls[0]![0]).toMatch(/^\/data\/shelf\?/)
        // `afterAction`'s one refresh, after the reload; the line itself refreshes nothing.
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(showToast).not.toHaveBeenCalled()
      })

      it('keeps Book detail open after removing the only copy while an entry remains', async () => {
        holds(linna, [copy(21)], [ENTRIES[1]!])
        removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 1, skipped: [] } })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        await confirmRemove(sheet)
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([21])
        await waitFor(() => expect(document.activeElement).toBe(onWishlists(sheet)))
        expect(router.replace).not.toHaveBeenCalled()
        expect(router.back).not.toHaveBeenCalled()
        expect(sheet.isConnected).toBe(true)
      })

      it('receives an ordered copy with a toast that undoes it, and refreshes Book detail', async () => {
        holds(linna, [copy(21, { status: 'ordered' })])
        receiveCopyAction.mockResolvedValue({
          ok: true,
          data: { savedTo: { id: 3, name: 'Olohuone' }, undoToken: 'tok', undoSeconds: 1800 },
        })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        fireEvent.click(within(sheet).getByRole('button', { name: 'Received' }))
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(receiveCopyAction).toHaveBeenCalledExactlyOnceWith({ copyId: 21 })
        expect(showToast).toHaveBeenCalledExactlyOnceWith({
          kind: 'success',
          message: 'Saved to Olohuone',
          undo: { token: 'tok', seconds: 1800 },
        })
      })

      it('refreshes Book detail when the copy is gone already', async () => {
        holds(linna, [copy(21), copy(22)])
        removeCopiesAction.mockResolvedValue({ ok: false, code: 'NOT_FOUND' })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        await confirmRemove(sheet)
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(showToast).toHaveBeenCalledExactlyOnceWith({
          kind: 'success',
          message: 'Not in library',
        })
      })
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

      it('closes only the remove dialog on Esc, removing nothing', async () => {
        await renderPage({ book: '5' })
        const aside = await panel('Tuntematon sotilas')

        fireEvent.click(within(aside).getByRole('button', { name: 'Remove' }))
        const dialog = await screen.findByRole('dialog', { name: 'Remove 1 book from library?' })
        fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Cancel' }), {
          key: 'Escape',
        })
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        await act(async () => {})
        expect(await panel('Tuntematon sotilas')).toBe(aside)
        expect(router.replace).not.toHaveBeenCalled()
        expect(removeCopiesAction).not.toHaveBeenCalled()
      })

      it('closes only the Move picker on Esc, moving nothing', async () => {
        listLocations.mockResolvedValue([{ id: 4, name: 'Mökki' }])
        await renderPage({ book: '5' })
        const aside = await panel('Tuntematon sotilas')

        fireEvent.click(within(aside).getByRole('button', { name: 'Move' }))
        const picker = await screen.findByRole('dialog', { name: 'Move to' })
        fireEvent.keyDown(within(picker).getByRole('button', { name: 'Mökki' }), {
          key: 'Escape',
        })
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        await act(async () => {})
        expect(await panel('Tuntematon sotilas')).toBe(aside)
        expect(router.replace).not.toHaveBeenCalled()
        expect(moveCopiesAction).not.toHaveBeenCalled()
      })

      it('closes after removing the only copy, and reloads the rows', async () => {
        // The dialog's pop lands here: an entry with no in-app one below, so closing replaces.
        window.history.replaceState(null, '', '/')
        removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 1, skipped: [] } })
        fetchStub.mockResolvedValue({
          status: 200,
          json: async () => ({ ok: true, data: { rows: [row(12, sinuhe)], total: 1, labels: {} } }),
        })
        await renderPage({ book: '5' })
        const aside = await panel('Tuntematon sotilas')

        fireEvent.click(within(aside).getByRole('button', { name: 'Remove' }))
        const dialog = await screen.findByRole('dialog', { name: 'Remove 1 book from library?' })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/', { scroll: false }))
        expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([25])
        expect(fetchStub.mock.calls[0]![0]).toMatch(/^\/data\/shelf\?/)
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
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
