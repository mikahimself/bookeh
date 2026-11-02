// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createElement, type ComponentProps, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SearchDraft } from '@/lib/catalogue/searchBooks'
import type { MyBook } from '@/lib/shelf/query'

import { copy, hit, mine } from '../helpers/lookupFixtures'
import { serverTree } from '../helpers/serverTree'

// EXPERIENCE.md, Lookup; FR-20, FR-37: the field alone until a search has run,
// then "In your library" above "Elsewhere", one row each; "Nothing found" when
// both answered empty; a refused source search keeps the own group and toasts
// "Too many lookups. Wait a moment."; Go submits the typed text, an empty
// field nothing; a result is pushed, so Back returns to the results; Scan
// opens the screen.

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }
const searchMine = vi.fn<(ctx: unknown, text: string) => Promise<MyBook[]>>()
const searchBooks = vi.fn<(ctx: unknown, text: string) => Promise<SearchDraft[]>>()
const showToast = vi.fn()

const english = async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const { default: messages } = await import('../../messages/en.json')
  return (namespace?: string) =>
    createTranslator({ locale: 'en', messages, namespace: namespace as 'lookup' })
}

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: await english(),
  useLocale: () => 'en',
}))
vi.mock('next-intl/server', async () => {
  const translator = await english()
  return { getTranslations: async (namespace?: string) => translator(namespace) }
})
// React 19.2 has no `ViewTransition`; the app runs on Next's own build.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ViewTransition: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
  usePathname: () => '/scan/find',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/link', () => ({
  default: ({
    href,
    replace,
    scroll,
    prefetch: _prefetch,
    onClick,
    ...rest
  }: ComponentProps<'a'> & {
    href: string
    replace?: boolean
    scroll?: boolean
    prefetch?: boolean
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
vi.mock('@/lib/payload/context', () => ({ requireUser: async () => ({ user: { id: 1 } }) }))
vi.mock('@/lib/shelf/searchMine', () => ({ searchMine }))
vi.mock('@/lib/catalogue/searchBooks', () => ({ searchBooks }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({
    show: showToast,
    dismiss: vi.fn(),
    withdraw: vi.fn(),
    onUndone: () => () => {},
  }),
}))

const { DomainError } = await import('@/lib/errors')
const { default: LookupPage } = await import('@/app/(frontend)/scan/find/page')

const renderPage = async (search: Record<string, string> = {}) =>
  render(await serverTree(await LookupPage({ searchParams: Promise.resolve(search) })))

describe('Lookup', () => {
  beforeEach(() => {
    window.history.pushState({ page: 'find' }, '', '/scan/find')
    vi.stubGlobal('matchMedia', (query: string) => ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    searchMine.mockResolvedValue([])
    searchBooks.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders the field alone and asks nothing without a q', async () => {
    await renderPage()

    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Find'])
    screen.getByLabelText('Title or author')
    expect(screen.queryByText('Nothing found')).toBe(null)
    expect(screen.queryByRole('listitem')).toBe(null)
    expect(searchMine).not.toHaveBeenCalled()
    expect(searchBooks).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Add by hand' })).toBe(null)
  })

  it('asks nothing for blank text, keeping it in the field', async () => {
    await renderPage({ q: '  ' })

    expect(screen.getByLabelText<HTMLInputElement>('Title or author').value).toBe('  ')
    expect(screen.queryByText('Nothing found')).toBe(null)
    expect(searchMine).not.toHaveBeenCalled()
    expect(searchBooks).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Add by hand' })).toBe(null)
  })

  it('shows the own group above Elsewhere, with each row’s cover, title and lines', async () => {
    searchMine.mockResolvedValue([
      mine({}, [
        copy({ loan: { loanId: 4, person: { id: 5, name: 'Hilla' }, since: '2026-01-02' } }),
      ]),
    ])
    searchBooks.mockResolvedValue([hit({ hasCover: true }), hit({ isbn13: '9789510222222' })])
    await renderPage({ q: 'linna' })

    expect(searchMine).toHaveBeenCalledWith(expect.anything(), 'linna')
    expect(searchBooks).toHaveBeenCalledWith(expect.anything(), 'linna')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'In your library',
      'Elsewhere',
    ])

    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByRole('link').getAttribute('href'))).toEqual([
      '/scan?book=1',
      '/scan?isbn=9789511111118',
      '/scan?isbn=9789510222222',
    ])
    within(rows[0]).getByText('Väinö Linna')
    within(rows[0]).getByText('1954 · WSOY')
    within(rows[0]).getByText('Lent · Hilla')
    within(rows[1]).getByText('nidottu · 1945 · WSOY')
    expect(rows[1].querySelector('img')?.getAttribute('src')).toBe('/data/cover/9789511111118')
    // Not servable: the cloth placeholder with the title in it.
    expect(rows[2].querySelector('img')).toBe(null)
    within(rows[2]).getByText('Sinuhe egyptiläinen', { selector: 'span' })
  })

  it('shows one group alone without the other heading or Nothing found', async () => {
    searchMine.mockResolvedValue([mine()])
    await renderPage({ q: 'linna' })

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'In your library',
    ])
    expect(screen.queryByText('Nothing found')).toBe(null)
    expect(screen.queryByRole('link', { name: 'Add by hand' })).toBe(null)
  })

  it('shows the Elsewhere group alone when nothing of the viewer’s matched', async () => {
    searchBooks.mockResolvedValue([hit()])
    await renderPage({ q: 'waltari' })

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Elsewhere',
    ])
    expect(screen.queryByText('Nothing found')).toBe(null)
    expect(screen.queryByRole('link', { name: 'Add by hand' })).toBe(null)
  })

  it('pushes a result, so Back on its Answer returns to the results', async () => {
    searchMine.mockResolvedValue([mine()])
    await renderPage({ q: 'linna' })

    fireEvent.click(within(screen.getAllByRole('listitem')[0]).getByRole('link'))
    expect(router.push).toHaveBeenCalledWith('/scan?book=1', { scroll: false })
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('shows Nothing found when both searches answered empty', async () => {
    await renderPage({ q: 'ei mitään' })

    screen.getByText('Nothing found')
    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([])
    expect(screen.getByRole('link', { name: 'Add by hand' }).getAttribute('href')).toBe(
      '/scan?title=ei%20mit%C3%A4%C3%A4n',
    )
  })

  it('carries the trimmed text into Add by hand', async () => {
    await renderPage({ q: '  linna  ' })

    expect(screen.getByRole('link', { name: 'Add by hand' }).getAttribute('href')).toBe(
      '/scan?title=linna',
    )
  })

  it('keeps the own group and toasts when the source search is refused', async () => {
    searchMine.mockResolvedValue([mine()])
    searchBooks.mockRejectedValue(new DomainError('RATE_LIMITED'))
    await renderPage({ q: 'linna' })

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'In your library',
    ])
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(showToast).toHaveBeenCalledWith({ kind: 'error', code: 'RATE_LIMITED' })
  })

  it('raises no Nothing found when the source search is refused with nothing own', async () => {
    searchBooks.mockRejectedValue(new DomainError('RATE_LIMITED'))
    await renderPage({ q: 'linna' })

    expect(screen.queryByText('Nothing found')).toBe(null)
    expect(screen.queryByRole('link', { name: 'Add by hand' })).toBe(null)
    expect(showToast).toHaveBeenCalledWith({ kind: 'error', code: 'RATE_LIMITED' })
  })

  it('lets any other lookup failure through', async () => {
    searchBooks.mockRejectedValue(new DomainError('INTERNAL'))
    await expect(renderPage({ q: 'linna' })).rejects.toThrow('INTERNAL')
  })

  it('submits the typed text on Go and an empty field not at all', async () => {
    await renderPage()
    const field = screen.getByLabelText('Title or author')
    const go = screen.getByRole('button', { name: 'Find' })

    fireEvent.click(go)
    expect(router.push).not.toHaveBeenCalled()

    fireEvent.change(field, { target: { value: '  väinö linna  ' } })
    fireEvent.click(go)
    // Trimmed: one search is one address, and it is the text the page searches.
    expect(router.push).toHaveBeenCalledWith('/scan/find?q=v%C3%A4in%C3%B6%20linna')
  })
})
