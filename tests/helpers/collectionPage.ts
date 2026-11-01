import { cleanup, render, screen, within } from '@testing-library/react'
import { createElement, type ComponentProps } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'

import type { DevicePrefs } from '@/app/(frontend)/prefs'
import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { CopyLine, EntryLine, Holdings } from '@/lib/books/holdings'
import type { LocationOption } from '@/lib/copies/locations'
import type { ShelfRow, ShelfRows } from '@/lib/shelf/query'

import { serverTree } from './serverTree'

// The shared harness of the collection page's specs, one per surface: mocks,
// globals, fixtures and render helpers. A spec imports it before anything that
// loads the page, keeps its own `// @vitest-environment jsdom` line, and calls
// `resetCollectionPage()` inside its `describe('CollectionPage')`.

export const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() }
let searchParams = new URLSearchParams()
export const getShelfRows = vi.fn<() => Promise<ShelfRows>>()
export const heldBook =
  vi.fn<(ctx: unknown, bookId: number) => Promise<EffectiveBook | undefined>>()
export const getHoldings = vi.fn<(ctx: unknown, ids: number[]) => Promise<Map<number, Holdings>>>()
export const logError = vi.fn()
export const devicePrefs = vi.fn<() => Promise<DevicePrefs>>()
export const setDevicePrefsAction = vi.fn()
export const fetchStub = vi.fn()
export const showToast = vi.fn()
export const removeCopiesAction = vi.fn()
export const toggleCopiesReadAction = vi.fn()
export const setNoteAction = vi.fn()
export const receiveCopyAction = vi.fn()
export const moveCopiesAction = vi.fn()
export const listLocations = vi.fn<(ctx: unknown) => Promise<LocationOption[]>>()
export const lendingPeople = vi.fn<(ctx: unknown) => Promise<{ id: number; name: string }[]>>()
export const lendCopyAction = vi.fn()
export const returnLoanAction = vi.fn()
/** The signed-in viewer: a plain user unless a case makes them the admin. */
export const requireUser = vi.fn<() => Promise<{ user: { roles: ('admin' | 'user')[] } }>>()

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

export const { default: CollectionPage } = await import('@/app/(frontend)/(sections)/page')
export const { DEFAULT_PREFS } = await import('@/app/(frontend)/prefs')
export const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')

/** The address the page's client side reads; reset after each case. */
export const setSearchParams = (init?: ConstructorParameters<typeof URLSearchParams>[0]) => {
  searchParams = new URLSearchParams(init)
}

/** The answer to `matchMedia`; reset to the phone after each case. */
export const setScreen = (matches: (query: string) => boolean) => {
  matchesScreen = matches
}

export const page = async (params: Record<string, string>) =>
  serverTree(await CollectionPage({ searchParams: Promise.resolve(params) }))

export const book = (
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

export const row = (
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
export const lentRow = (r: ShelfRow): ShelfRow => ({ ...r, copy: { ...r.copy, loan: antti } })

export const copy = (copyId: number, extra: Partial<CopyLine> = {}): CopyLine => ({
  copyId,
  status: 'owned',
  location: null,
  note: null,
  loan: null,
  ...extra,
})

/** The viewer holds `copies` and open `entries` of `b`: Book detail's reads. */
export function holds(b: EffectiveBook, copies: CopyLine[], entries: EntryLine[] = []) {
  heldBook.mockImplementation(async (_, bookId) => (bookId === b.bookId ? b : undefined))
  getHoldings.mockImplementation(
    async (_, ids) => new Map(ids.map((id) => [id, { copies, entries }])),
  )
}

/** Liisa's entry on Joululahjat, then the viewer's own on Luettavat. */
export const ENTRIES: EntryLine[] = [
  { entryId: 51, wishlist: { id: 4, name: 'Joululahjat' }, forPerson: { id: 41, name: 'Liisa' } },
  { entryId: 52, wishlist: { id: 7, name: 'Luettavat' }, forPerson: null },
]

/** Book detail's On wishlists group, by its heading. */
export const onWishlists = (sheet: HTMLElement) =>
  within(sheet).getByRole('heading', { name: 'On wishlists' }).closest('section') as HTMLElement

export async function renderPage(params: Record<string, string> = {}) {
  return render(await page(params))
}

export const detail = (name: string) => screen.findByRole('dialog', { name })

export const countLine = () => screen.getByText(/\d+ books?/).closest('p') as HTMLElement

export const pressed = (group: string) =>
  within(screen.getByRole('group', { name: group })).getByRole('button', { pressed: true })
    .textContent

/** The Book of Book detail's cases. */
export const linna = book(5, 'Tuntematon sotilas', {
  series: { id: 2, name: 'Sotaromaanit' },
  genres: [{ id: 8, name: 'Sotaromaani' }],
  seriesIndex: 1,
  pages: 474,
  language: 'fin',
})

/** Every case's defaults and clean-up. Call inside `describe('CollectionPage')`. */
export function resetCollectionPage() {
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
    setSearchParams()
    setScreen(() => false)
  })
}
