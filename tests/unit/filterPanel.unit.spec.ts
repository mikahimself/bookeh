// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FilterValues } from '@/lib/shelf/query'

// 900–1199px has room for one side panel (EXPERIENCE.md, Responsive):
// opening Filter closes Book detail, and Book detail opening closes Filter.

const router = { replace: vi.fn() }
let search = new URLSearchParams()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => search,
}))

// The tools row's layout and size switches: no saving here.
vi.mock('@/app/(frontend)/actions/prefs', () => ({ setDevicePrefsAction: vi.fn() }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn(), withdraw: vi.fn() }),
}))

const { CollectionDisplayProvider } = await import('@/app/(frontend)/(sections)/CollectionDisplay')
const { CollectionTools } = await import('@/app/(frontend)/(sections)/CollectionTools')
const { FilterPanel, FilterPanelProvider } = await import('@/app/(frontend)/(sections)/FilterPanel')

const values: FilterValues = {
  location: [],
  status: [{ value: 'owned', count: 2 }],
  read: [],
  genre: [],
  language: [],
}

const page = () =>
  createElement(
    CollectionDisplayProvider,
    // `children` comes as the arguments after props.
    { initial: { layout: 'rows', size: 'm' } } as ComponentProps<typeof CollectionDisplayProvider>,
    createElement(
      FilterPanelProvider,
      null,
      createElement(CollectionTools),
      createElement(FilterPanel, { values }),
    ),
  )

const filter = () => screen.getByRole('button', { name: 'filter' })
const panel = () => screen.queryByRole('complementary', { name: 'filter' })

describe('Filter panel at 1000px', () => {
  beforeEach(() => {
    // 1000px: wide, and under 1200px.
    vi.stubGlobal('matchMedia', (query: string) => ({
      media: query,
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('closes Book detail when Filter opens', () => {
    search = new URLSearchParams('q=linna&location=3&book=7')
    render(page())

    fireEvent.click(filter())
    expect(router.replace).toHaveBeenCalledWith('/?q=linna&location=3', { scroll: false })
    expect(panel()).not.toBeNull()
  })

  it('closes Filter when a Book opens', () => {
    search = new URLSearchParams('location=3')
    const { rerender } = render(page())
    fireEvent.click(filter())
    expect(panel()).not.toBeNull()
    expect(router.replace).not.toHaveBeenCalled()

    search = new URLSearchParams('location=3&book=7')
    rerender(page())
    expect(panel()).toBeNull()
    expect(filter().getAttribute('aria-expanded')).toBe('false')
  })
})

describe('Filter panel option taps from 1200px', () => {
  beforeEach(() => {
    // 1300px: wide, with room for Book detail beside it.
    vi.stubGlobal('matchMedia', (query: string) => ({
      media: query,
      matches: !query.includes('1200px'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  const owned = () => screen.getByRole('button', { name: /owned/ })

  it('replaces the address at once, keeping search and the open Book', () => {
    search = new URLSearchParams('q=linna&book=7')
    render(page())
    fireEvent.click(filter())
    fireEvent.click(owned())
    expect(router.replace).toHaveBeenCalledWith('/?q=linna&status=owned&book=7', {
      scroll: false,
    })
  })

  it('switches the marker off after Clear', () => {
    search = new URLSearchParams()
    const { rerender } = render(page())
    fireEvent.click(filter())
    fireEvent.click(owned())
    expect(owned().getAttribute('aria-pressed')).toBe('true')

    search = new URLSearchParams('status=owned')
    rerender(page())
    search = new URLSearchParams()
    rerender(page())
    expect(owned().getAttribute('aria-pressed')).toBe('false')
  })
})
