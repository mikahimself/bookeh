// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  cloneElement,
  createElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { CopyLine, Holdings } from '@/lib/books/holdings'
import type { LocationOption } from '@/lib/copies/locations'
import type { OpenLoan } from '@/lib/loans/loans'

// EXPERIENCE.md, Loans (by date) and States; FR-37: the open loans as one
// list, longest out first; Nothing lent; Load failed; Book detail on `/loans`.

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() }
const openLoans = vi.fn<(ctx: unknown) => Promise<OpenLoan[]>>()
const getEffectiveBooks =
  vi.fn<(ctx: unknown, ids: readonly number[]) => Promise<Map<number, EffectiveBook>>>()
const heldBook = vi.fn<(ctx: unknown, bookId: number) => Promise<EffectiveBook | undefined>>()
const getHoldings = vi.fn<(ctx: unknown, ids: number[]) => Promise<Map<number, Holdings>>>()
const listLocations = vi.fn<(ctx: unknown) => Promise<LocationOption[]>>()
const logError = vi.fn()
const showToast = vi.fn()

const english = async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const { default: messages } = await import('../../messages/en.json')
  return (namespace?: string) =>
    createTranslator({ locale: 'en', messages, namespace: namespace as 'loans' })
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
  usePathname: () => '/loans',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/payload/context', () => ({
  requireUser: async () => ({ user: { roles: ['user'] } }),
}))
vi.mock('@/lib/errors', () => ({ logger: () => ({ error: logError }) }))
vi.mock('@/lib/loans/loans', () => ({ openLoans }))
vi.mock('@/lib/books/effectiveBook', () => ({ getEffectiveBooks }))
vi.mock('@/lib/copies/locations', () => ({ listLocations }))
vi.mock('@/lib/people/people', () => ({ lendingPeople: async () => [] }))
vi.mock('@/app/(frontend)/actions/loans', () => ({
  lendCopyAction: vi.fn(),
  returnLoanAction: vi.fn(),
}))
vi.mock('@/app/(frontend)/(sections)/actions', () => ({
  removeCopiesAction: vi.fn(),
  receiveCopyAction: vi.fn(),
  setReadAction: vi.fn(),
  setRatingAction: vi.fn(),
  setNoteAction: vi.fn(),
  toggleCopiesReadAction: vi.fn(),
  moveCopiesAction: vi.fn(),
}))
vi.mock('@/app/(frontend)/heldBook', () => ({ heldBook }))
vi.mock('@/lib/books/holdings', () => ({ getHoldings }))
vi.mock('@/lib/books/userBookState', () => ({
  getUserBookState: async () => ({ read: false, rating: null }),
}))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({
    show: showToast,
    dismiss: vi.fn(),
    withdraw: vi.fn(),
    onUndone: () => () => {},
  }),
}))
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
// The phone: Book detail is the sheet.
vi.stubGlobal('matchMedia', (query: string) => ({
  media: query,
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}))

const { default: LoansPage } = await import('@/app/(frontend)/(sections)/loans/page')

/** The page's tree with its async server components awaited, as the server renderer does. */
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

const renderPage = async (params: Record<string, string> = {}) =>
  render(await serverTree(await LoansPage({ searchParams: Promise.resolve(params) })))

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

const puhdistus = book(7, 'Puhdistus', [{ id: 3, name: 'Sofi Oksanen' }])
const sinuhe = book(8, 'Sinuhe', [])

const loan = (loanId: number, bookId: number, name: string, since: string): OpenLoan => ({
  loanId,
  copyId: loanId + 100,
  bookId,
  person: { id: loanId + 200, name },
  since,
})

const lent = (loans: OpenLoan[], books: EffectiveBook[]) => {
  openLoans.mockResolvedValue(loans)
  getEffectiveBooks.mockResolvedValue(new Map(books.map((b) => [b.bookId, b])))
}

const rowText = () =>
  screen.getAllByRole('listitem').map((item) =>
    Array.from(item.querySelectorAll('p'))
      .map((p) => p.textContent)
      .join(' | '),
  )

describe('LoansPage', () => {
  beforeEach(() => {
    listLocations.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    heldBook.mockReset()
    getHoldings.mockReset()
  })

  it('lists the open loans in openLoans order, one row each, linking to Book detail on /loans', async () => {
    lent(
      [
        loan(2, 7, 'Leena', '2026-07-02'),
        loan(4, 8, 'Antti', '2026-09-12'),
        loan(5, 8, 'Antti', '2026-09-12'),
      ],
      [sinuhe, puhdistus],
    )
    await renderPage()

    expect(rowText()).toEqual([
      'Puhdistus | Sofi Oksanen | Leena · since Jul 2, 2026',
      'Sinuhe | Antti · since Sep 12, 2026',
      'Sinuhe | Antti · since Sep 12, 2026',
    ])
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/loans?book=7',
      '/loans?book=8',
      '/loans?book=8',
    ])
    fireEvent.click(screen.getAllByRole('link')[0]!)
    expect(router.push).toHaveBeenCalledWith('/loans?book=7', { scroll: false })
  })

  it('leaves out a loan whose Book the viewer can no longer read', async () => {
    lent([loan(2, 7, 'Leena', '2026-07-02'), loan(4, 9, 'Antti', '2026-09-12')], [puhdistus])
    await renderPage()
    expect(rowText()).toEqual(['Puhdistus | Sofi Oksanen | Leena · since Jul 2, 2026'])
  })

  it('shows Nothing lent with no open loans', async () => {
    lent([], [])
    await renderPage()
    expect(screen.getByText('Nothing lent')).toBeTruthy()
    expect(screen.getByText('Either everyone returns things or nobody asks.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('shows Load failed when the loans read fails, and Try again renders the address again', async () => {
    openLoans.mockRejectedValue(new Error('down'))
    await renderPage()
    expect(logError).toHaveBeenCalled()
    expect(screen.getByText("Couldn't load.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(router.refresh).toHaveBeenCalledOnce()
  })

  it('opens Book detail at ?book= with its row marked, and its X closes to /loans', async () => {
    lent([loan(2, 7, 'Leena', '2026-07-02')], [puhdistus])
    heldBook.mockImplementation(async (_, id) => (id === 7 ? puhdistus : undefined))
    const lentCopy: CopyLine = {
      copyId: 102,
      status: 'owned',
      location: null,
      note: null,
      loan: { loanId: 2, person: { id: 202, name: 'Leena' }, since: '2026-07-02' },
    }
    getHoldings.mockResolvedValue(new Map([[7, { copies: [lentCopy], entries: [] }]]))
    await renderPage({ book: '7' })

    const sheet = await screen.findByRole('dialog', { name: 'Puhdistus' })
    const rowLink = screen.getAllByRole('link', { hidden: true })[0]!
    expect(rowLink.getAttribute('aria-current')).toBe('true')

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/loans', { scroll: false }))
  })

  it('toasts Not in library for a Book not held and leaves book, staying on /loans', async () => {
    lent([loan(2, 7, 'Leena', '2026-07-02')], [puhdistus])
    heldBook.mockResolvedValue(undefined)
    await renderPage({ book: '99' })

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({ kind: 'success', message: 'Not in library' }),
    )
    expect(router.replace).toHaveBeenCalledWith('/loans', { scroll: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
