// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FilterValues, Suggestion, SuggestField } from '@/lib/shelf/query'

// 900–1199px has room for one side panel (EXPERIENCE.md, Responsive):
// opening Filter closes Book detail, and Book detail opening closes Filter.

const router = { replace: vi.fn() }
let search = new URLSearchParams()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name === undefined ? key : `${key}: ${values.name}`,
  useLocale: () => 'en',
}))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => search,
}))

// Every typed text suggests the field's names, as `/data/suggest` would for it.
const suggestions: Record<SuggestField, Suggestion[]> = {
  author: [
    { id: 4, name: 'Väinö Linna' },
    { id: 9, name: 'Kalle Päätalo' },
  ],
  series: [],
  publisher: [{ id: null, name: 'WSOY' }],
}
vi.mock('@/app/(frontend)/components/suggest', () => ({
  useSuggestions: (field: SuggestField, text: string) => (text.trim() ? suggestions[field] : []),
}))

// The tools row's layout and size switches: no saving here.
vi.mock('@/app/(frontend)/actions/prefs', () => ({ setDevicePrefsAction: vi.fn() }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn(), withdraw: vi.fn() }),
}))

const { CollectionDisplayProvider } = await import('@/app/(frontend)/(sections)/CollectionDisplay')
const { CollectionTools } = await import('@/app/(frontend)/(sections)/CollectionTools')
const { FilterPanel, FilterPanelProvider } = await import('@/app/(frontend)/(sections)/FilterPanel')
const { SelectionProvider } = await import('@/app/(frontend)/(sections)/Selection')

const values: FilterValues = {
  location: [],
  status: [{ value: 'owned', count: 2 }],
  read: [],
  genre: [],
  language: [],
}

let labels: Record<string, string> = {}

const page = () =>
  createElement(
    CollectionDisplayProvider,
    // `children` comes as the arguments after props.
    { initial: { layout: 'rows', size: 'm' } } as ComponentProps<typeof CollectionDisplayProvider>,
    createElement(
      FilterPanelProvider,
      null,
      createElement(
        SelectionProvider,
        null,
        createElement(CollectionTools),
        createElement(FilterPanel, { values, labels }),
      ),
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

describe('Filter panel author, series and publisher', () => {
  beforeEach(() => {
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
    labels = {}
  })

  const author = () =>
    screen.getByRole<HTMLInputElement>('combobox', { name: 'filterFields.author' })

  it('adds a chosen suggestion, lists it and offers only values not on', async () => {
    search = new URLSearchParams('q=linna&author=4&book=7')
    labels = { 'author:4': 'Väinö Linna' }
    render(page())
    fireEvent.click(filter())

    act(() => author().focus())
    fireEvent.input(author(), { target: { value: 'a' }, inputType: 'insertText' })
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy())
    // Väinö Linna is on already, and there is no "New:" row.
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Kalle Päätalo',
    ])

    fireEvent.click(screen.getByRole('option', { name: 'Kalle Päätalo' }))
    expect(router.replace).toHaveBeenCalledWith('/?q=linna&author=4&author=9&book=7', {
      scroll: false,
    })
    // Named from the choice until the server render brings the label.
    expect(screen.getByRole('button', { name: 'filterRemove: Väinö Linna' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'filterRemove: Kalle Päätalo' })).toBeTruthy()
    await waitFor(() => expect(author().value).toBe(''))
  })

  it('adds a chosen publisher by name and lists it', async () => {
    search = new URLSearchParams()
    render(page())
    fireEvent.click(filter())

    const publisher = screen.getByRole('combobox', { name: 'filterFields.publisher' })
    act(() => publisher.focus())
    fireEvent.input(publisher, { target: { value: 'ws' }, inputType: 'insertText' })
    fireEvent.click(await screen.findByRole('option', { name: 'WSOY' }))
    expect(router.replace).toHaveBeenCalledWith('/?publisher=WSOY', { scroll: false })
    expect(screen.getByRole('button', { name: 'filterRemove: WSOY' })).toBeTruthy()
  })

  it('removes a listed value, dropping the field with its last value', () => {
    search = new URLSearchParams('publisher=WSOY')
    render(page())
    fireEvent.click(filter())

    fireEvent.click(screen.getByRole('button', { name: 'filterRemove: WSOY' }))
    expect(router.replace).toHaveBeenCalledWith('/', { scroll: false })
  })
})
